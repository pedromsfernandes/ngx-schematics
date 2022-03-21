import { dirname, join, normalize } from "@angular-devkit/core";
import { indentBy } from "@angular-devkit/core/src/utils/literals";
import { findNode, findNodes, getSourceNodes, insertAfterLastOccurrence, insertImport } from "@schematics/angular/utility/ast-utils";
import { Change, InsertChange } from "@schematics/angular/utility/change";
import ts = require("typescript");
import { nameify } from "./string";

export enum MetadataProperty {
  Route = 'routes',
  Action = 'actions',
  ActionGroup = 'actionGroups',
  ActionButton = 'actionButtons',
  ActionButtonGroup = 'actionButtonGroups',
  ActionBar = 'actionBars',
  MenuItem = 'menuItems',
  MenuSubGroup = 'menuSubGroups',
  MenuGroup = 'menuGroups',
  EntityType = 'entityTypes',
  Table = 'tables',
  StaticType = 'staticTypes',
  FileViewer = 'fileViewers',
  SideBarTab = 'sideBarTabs',
  UserMenu = 'userMenus',
  Credit = 'credits',
  FlexComponent = 'flexComponents'
}

const PROPERTY_REFERENCE = {
  [MetadataProperty.Route]: { 'RouteConfig': 'cmf-core' },
  [MetadataProperty.Action]: { 'Action': 'cmf-core' },
  [MetadataProperty.ActionGroup]: { 'ActionGroup': 'cmf-core' },
  [MetadataProperty.ActionButton]: { 'ActionButton': 'cmf-core' },
  [MetadataProperty.ActionButtonGroup]: { 'ActionButtonGroup': 'cmf-core' },
  [MetadataProperty.ActionBar]: { 'ActionBar': 'cmf-core' },
  [MetadataProperty.MenuItem]: { 'MenuItem': 'cmf-core' },
  [MetadataProperty.MenuSubGroup]: { 'MenuSubGroup': 'cmf-core' },
  [MetadataProperty.MenuGroup]: { 'MenuGroup': 'cmf-core' },
  [MetadataProperty.EntityType]: { 'EntityTypeMetadata': 'cmf-core' },
  [MetadataProperty.Table]: { 'Table': 'cmf-core' },
  [MetadataProperty.StaticType]: { 'StaticType': 'cmf-core' },
  [MetadataProperty.FileViewer]: { 'FileViewerMetadata': 'cmf-core' },
  [MetadataProperty.SideBarTab]: { 'SideBarTab': 'cmf-core' },
  [MetadataProperty.UserMenu]: { 'UserMenu': 'cmf-core' },
  [MetadataProperty.Credit]: { 'Credit': 'cmf-core' },
  [MetadataProperty.FlexComponent]: { 'FlexComponent': 'cmf-core' }
};

export interface PackageInfo {
  package: string;
  widgets: string[];
  converters: string[];
  dataSources: string[];
  components: string[];
}

/**
 * Updates the space identation in a string
 * @param spacesToUse Spaces to use in the identation
 */
export function updateSpaces(spacesToUse: number, initialSpaces: number = 2) {
  return (strings: TemplateStringsArray, ...substitutions: any[]) => {
    return String.raw(strings, ...substitutions).replace(/^([ \t]+)/gm, (_, match: string) => {
      const spaces = match.split('').reduce((res, char) => res += char === ' ' ? 1 : 2, 0)
      return `${' '.repeat(Math.floor(spaces / initialSpaces) * spacesToUse + spaces % 2)}`;
    });
  };
}

/**
 * Finds the metadata file path in the root given the public api
 * @param content File content to search the metadata on
 * @param fileName Metadata File Name
 */
export function findMetadataFile(content: string, fileName: string, root: string) {
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const exportNodes = findNodes(source, ts.SyntaxKind.ExportDeclaration);

  for (const node of exportNodes) {
    const importFiles = node.getChildren()
      .filter(ts.isLiteralExpression)
      .filter((n) => n.text.endsWith('metadata.service'));

    if (importFiles.length === 1) {
      return join(dirname(join(normalize(root), 'metadata', fileName)), importFiles[0].text) + '.ts';
    }
  }

  return null;
}

/**
 * Inserts content in the metadata file.
 * @param content Metadata File Content
 * @param filePath Metadata File Path
 * @param requiredImports Required Import of the content to insert
 * @param propertyIdentifier Identifier of the content
 * @param typeReference Type reference of the object to insert
 * @param description Property to insert description
 * @param toInsert Content to insert
 */
export function insertMetadata(
  content: string,
  filePath: string,
  requiredImports: Record<string, string>,
  propertyIdentifier: MetadataProperty,
  toInsert: string
) {
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  const metadataClassDeclaration = getSourceNodes(source)
    .filter(ts.isClassDeclaration)
    .filter(node => {
      if (!node.heritageClauses) {
        return false;
      }

      return node.heritageClauses.find((clause) =>
        clause.getChildAt(0).kind === ts.SyntaxKind.ExtendsKeyword
        && findNode(clause, ts.SyntaxKind.Identifier, 'PackageMetadata'));
    })[0];

  const allAccessors = findNodes(metadataClassDeclaration, ts.isGetAccessor);

  const actions = allAccessors.find((accessor) =>
    accessor.getChildren().find(node => node.kind === ts.SyntaxKind.Identifier && node.getText() === propertyIdentifier));

  const contentNode = metadataClassDeclaration.getChildAt(metadataClassDeclaration.getChildren()
    .findIndex(node => node.kind === ts.SyntaxKind.OpenBraceToken) + 1);

  const spaces = contentNode.getFullText().match(/^(\r?\n)+(\s*)/)?.[2].length ?? 2;

  if (!actions) {
    const toInsertSpaced = updateSpaces(spaces)`

  /**
   * ${nameify(propertyIdentifier)}
   */
  public override get ${propertyIdentifier}(): ${Object.keys(PROPERTY_REFERENCE[propertyIdentifier])[0]}[] {
    return [
${indentBy(6)`${toInsert}`}
    ];
  }`;

    const fallbackPos = findNodes(contentNode, ts.SyntaxKind.Constructor, 1)[0]?.getEnd() ?? contentNode.getStart();
    return [
      ...Object.keys({
        ...requiredImports,
        ...PROPERTY_REFERENCE[propertyIdentifier]
      }).map((key) => insertImport(source, filePath, key, requiredImports[key])),
      insertAfterLastOccurrence(allAccessors, toInsertSpaced, filePath, fallbackPos, ts.SyntaxKind.GetAccessor)
    ];
  }

  const returnStatement = findNodes(actions, ts.SyntaxKind.ReturnStatement, 1, true)[0];
  const array = findNodes(returnStatement, ts.SyntaxKind.ArrayLiteralExpression, 1, true)[0];
  const list = array.getChildAt(1);

  const lastChild = list.getChildAt(list.getChildCount() - 1);

  const toInsertSpaced = updateSpaces(spaces)`${lastChild && lastChild.kind !== ts.SyntaxKind.CommaToken ? ',' : ''}
${indentBy(6)`${toInsert}`}${lastChild ? '' : `\n    `}`;

  return [
    ...Object.keys(requiredImports).map((key) => insertImport(source, filePath, key, requiredImports[key])),
    new InsertChange(filePath, lastChild?.getEnd() ?? array.getEnd() - 1, toInsertSpaced)
  ];
}

export function insertPackageInfoMetadata(content: string, filePath: string, options: PackageInfo) {
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  const metadataClassDeclaration = getSourceNodes(source)
    .filter(ts.isClassDeclaration)
    .filter(node => {
      if (!node.heritageClauses) {
        return false;
      }

      return node.heritageClauses.find((clause) =>
        clause.getChildAt(0).kind === ts.SyntaxKind.ExtendsKeyword
        && findNode(clause, ts.SyntaxKind.Identifier, 'PackageMetadata'));
    })[0];

  const allAccessors = findNodes(metadataClassDeclaration, ts.isGetAccessor);

  const packageInfoAccessor = allAccessors.find((accessor) =>
    accessor.getChildren().find(node => node.kind === ts.SyntaxKind.Identifier && node.getText() === 'packageInfo'));

  const contentNode = metadataClassDeclaration.getChildAt(metadataClassDeclaration.getChildren()
    .findIndex(node => node.kind === ts.SyntaxKind.OpenBraceToken) + 1);

  const spaces = contentNode.getFullText().match(/^(\r?\n)+(\s*)/)?.[2].length ?? 2;

  if (!packageInfoAccessor) {
    const toInsertSpaced = updateSpaces(spaces)`

  /**
   * Package Info
   */
  public override get packageInfo(): PackageInfo {
    return {
      name: '${options.package}',
      loader: () => import(
        /* webpackExports: [
${indentBy(10)`"${[
        ...options.widgets,
        ...options.dataSources,
        ...options.converters,
        ...options.components
      ].join(`",\n"`)}"`}
        ] */
        '${options.package}'),
      widgets: [
${indentBy(8)`'${options.widgets.join(`',\n'`)}'`}
      ],
      dataSources: [
${indentBy(8)`'${options.dataSources.join(`',\n'`)}'`}
      ],
      converters: [
${indentBy(8)`'${options.converters.join(`',\n'`)}'`}
      ],
      components: [
${indentBy(8)`'${options.components.join(`',\n'`)}'`}
      ]
    }
  }`;

    const fallbackPos = findNodes(contentNode, ts.SyntaxKind.Constructor, 1)[0]?.getEnd() ?? contentNode.getStart();
    return [
      insertImport(source, filePath, 'PackageInfo', 'cmf-core'),
      insertAfterLastOccurrence(allAccessors, toInsertSpaced, filePath, fallbackPos, ts.SyntaxKind.GetAccessor)
    ];
  }

  const returnStatement = findNodes(packageInfoAccessor, ts.SyntaxKind.ReturnStatement, 1, true)[0];
  const addedTypes: string[] = [];
  const changes: Change[] = [];

  [
    {
      identifier: 'widgets',
      elements: options.widgets
    },
    {
      identifier: 'dataSources',
      elements: options.dataSources
    },
    {
      identifier: 'converters',
      elements: options.converters
    },
    {
      identifier: 'components',
      elements: options.components
    }
  ].forEach((prop) => {
    const property = findNode(returnStatement, ts.SyntaxKind.Identifier, prop.identifier)?.parent;

    if (!property || property.kind !== ts.SyntaxKind.PropertyAssignment) {
      return;
    }

    const arrayExp = (property as ts.PropertyAssignment).initializer as ts.ArrayLiteralExpression;

    if (arrayExp.kind !== ts.SyntaxKind.ArrayLiteralExpression) {
      return;
    }

    const elementsToAdd: string[] = [];

    prop.elements.forEach((type: string) => {
      if (!arrayExp.elements.find((elem) => elem.kind === ts.SyntaxKind.StringLiteral && (elem as ts.StringLiteral).text === type)) {
        elementsToAdd.push(type);
      }
    });

    if (elementsToAdd.length === 0) {
      return;
    }

    const list = arrayExp.getChildAt(1);
    const lastChild = list.getChildAt(list.getChildCount() - 1);

    const toInsertSpaced = updateSpaces(spaces)`${lastChild && lastChild.kind !== ts.SyntaxKind.CommaToken ? ',' : ''}
${indentBy(8)`'${elementsToAdd.join(`',\n'`)}'`}${lastChild ? '' : `\n      `}`;

    changes.push(new InsertChange(filePath, lastChild?.getEnd() ?? arrayExp.getEnd() - 1, toInsertSpaced));

    addedTypes.push(...elementsToAdd);
  });

  if (addedTypes.length === 0) {
    return;
  }

  const loader = findNode(returnStatement, ts.SyntaxKind.Identifier, 'loader')?.parent;

  const importExp = findNodes(loader!, ts.isCallExpression)
    .find(node => node.expression.getText() === 'import');

  if (!importExp) {
    return;
  }

  const ranges = ts.getLeadingCommentRanges(source.getFullText(), importExp.arguments[0].getFullStart());

  if (!ranges) {
    return;
  }

  ranges.forEach((range) => {
    const commentText = source.getFullText().slice(range.pos, range.end);
    const exports = /(webpackExports\s*:\s*\[)(.*?)\]/gms.exec(commentText);

    if (!exports) {
      return;
    }

    const insertPos = range.pos + exports.index + exports[1].length + exports[2]?.trimEnd().length ?? 0;
    const containsElements = exports[2] && exports[2].trim().length > 0;
    const toInsertSpaced = updateSpaces(spaces)`${containsElements && !exports[2].trimEnd().endsWith(',') ? ',' : ''}
${indentBy(10)`"${addedTypes.join(`",\n"`)}"`}${containsElements ? '' : `\n        `}`;

    changes.push(new InsertChange(filePath, insertPos, toInsertSpaced));
  });

  return changes;
}