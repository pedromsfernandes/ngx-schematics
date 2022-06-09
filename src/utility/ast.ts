import { dirname, join, normalize } from '@angular-devkit/core';
import { Tree } from '@angular-devkit/schematics';
import { ArrayLiteralExpression, createWrappedNode, Node, ObjectLiteralExpression, Project, SourceFile, SyntaxKind, ts } from 'ts-morph';
import { Change } from './recorder';


/**
 * Inserts an export declaration in a file
 * @param source Source File
 * @param symbolName Export symbol
 * @param module Export module specifier
 * @param isDefault Is Default Export
 */
export function insertExport(
    source: SourceFile,
    symbolName: string,
    module: string,
    isDefault = false
): void {
    const allExports = source.getExportDeclarations();
    const exportNode = allExports.find(node => node.getModuleSpecifierValue() === module);

    if (isDefault) {
        if (exportNode?.isNamespaceExport()) {
            return;
        }

        source.addExportDeclaration({ moduleSpecifier: module });
    } else if (exportNode) {
        const namedExports = exportNode.getNamedExports();

        if (namedExports.find(node => node.getName() === symbolName)) {
            return;
        }

        exportNode.addNamedExport(symbolName);
    } else {
        source.addExportDeclaration({ namedExports: [symbolName], moduleSpecifier: module });
    }
}

/**
 * Inserts an import Declaration in a file
 * @param source Source File
 * @param symbolName Import symbol
 * @param module Import module specifier
 * @param isDefault Is default import
 */
export function insertImport(
    source: SourceFile,
    symbolName: string,
    module: string,
    isDefault = false
): Change | undefined {
    const allImports = source.getImportDeclarations();
    const importNode = allImports.find(node => node.getModuleSpecifierValue() === module);
    let change: Node;

    if (isDefault) {
        if (importNode?.getNamespaceImport()) {
            return;
        }

        change = source.addImportDeclaration({ moduleSpecifier: module, defaultImport: '' });
    } else if (importNode) {
        const namedImports = importNode.getNamedImports();

        if (namedImports.find(node => node.getName() === symbolName)) {
            return;
        }

        change = importNode.addNamedImport(symbolName);
    } else {
        change = source.addImportDeclaration({ moduleSpecifier: module, namedImports: [symbolName] });
    }

    const position = change.getStart(true);
    const toInsert = change.getText(true);

    return [[position, position], toInsert];
}

export function addSymbolToNgModuleMetadata(
    source: SourceFile,
    metadataField: string,
    symbolName: string,
    importPath: string | null = null,
    insertBefore: string | null = null
): void {
    // Find the decorator declaration.
    let decoratorMetadata: ObjectLiteralExpression | undefined;
    for (const classNode of source.getClasses()) {
        decoratorMetadata = classNode.getDecorator('NgModule')?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);

        if (decoratorMetadata) {
            break;
        }
    }

    if (!decoratorMetadata) {
        return;
    }

    // Get all the children property assignment of object literals.
    const metadataProperty = decoratorMetadata.getProperty(metadataField);

    if (!metadataProperty) {
        // We haven't found the field in the metadata declaration. Insert a new field.
        decoratorMetadata.addPropertyAssignment({
            name: metadataField,
            initializer: `[\n${symbolName}\n]`
        });

        if (importPath !== null) {
            insertImport(source, symbolName.replace(/\..*$/, ''), importPath);
        }

        return;
    }

    const assignment = metadataProperty.asKind(SyntaxKind.PropertyAssignment);
    const arrLiteral = assignment?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression);

    if (!arrLiteral) {
        return;
    }

    if (arrLiteral.getElements().some(elem => elem.getText() === symbolName)) {
        return;
    }

    let index = arrLiteral.getElements().length;

    if (insertBefore) {
        index = arrLiteral.getElements().findIndex(elem => elem.getText() === insertBefore) ?? index;
    }

    arrLiteral.insertElement(index, symbolName);

    if (importPath !== null) {
        insertImport(source, symbolName.replace(/\..*$/, ''), importPath);
    }
}

/**
 * Finds the bootstrap module path from the main.ts file
 * @param source main.ts source file
 */
export function findBootstrapModulePath(source: ts.SourceFile): string | undefined {
    const rootNode = createWrappedNode(source);

    const bootstrapCall = rootNode
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .find((descNode) => descNode.getExpression().getText().endsWith('bootstrapModule'));

    if (!bootstrapCall) {
        return;
    }

    const bootstrapArg = bootstrapCall.getArguments()[0];

    if (!bootstrapArg) {
        return;
    }

    let moduleRelativePath: string | undefined;
    if (bootstrapArg.getKind() === SyntaxKind.Identifier) {
        moduleRelativePath = rootNode
            .getImportDeclarations()
            .find(impNode => impNode.getNamedImports().some(imp => imp.getName() === bootstrapArg.getText()))
            ?.getModuleSpecifierValue();
    } else if (bootstrapArg.getKind() === SyntaxKind.PropertyAccessExpression) {
        moduleRelativePath = rootNode
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .find(node => node.getExpression().getText() === 'import')
            ?.getArguments()[0]
            ?.asKind(SyntaxKind.StringLiteral)
            ?.getLiteralValue();
    }

    if (!moduleRelativePath) {
        return;
    }

    return join(dirname(normalize(rootNode.getFilePath())), moduleRelativePath) + '.ts';
}

export function insertElement(array: ArrayLiteralExpression, element: string, index?: number): Change {
    const lastElem = index === undefined ? array.getElements().slice(-1)[0] : array.getElements()[index];

    if (lastElem) {
        const spaces = lastElem.getFullText().match(/^\r?\n?\s+/)?.[0] ?? ' ';
        const position = lastElem.getFullStart();

        return [[position, position], `${spaces}${element},`];
    } else {
        if (array.getElements().length > 0) {
            const leadingSpaces = array.getElements()[0].getFullText().match(/^\r?\n?\s+/)?.[0];
            const trailingSpaces = leadingSpaces ? '' : ' ';

            return [[array.getStart(), array.getStart()], `${leadingSpaces}${element},${trailingSpaces}`]; // not finished
        } else {
            return [[array.getStart() + 1, array.getEnd() - 1], `${element}`];
        }
    }
}


/**
 * Gets the a ts source file
 */
export function createSourceFile(host: Tree, path: string): SourceFile | undefined {
    const content = host.get(path)?.content.toString('utf-8');

    if (!content) {
        return;
    }

    return new Project().createSourceFile(path, content, { overwrite: true });
}