import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { getAllFilesFromDir } from '@criticalmanufacturing/schematics-devkit/testing';
import { strings } from '@criticalmanufacturing/schematics-devkit';

describe('Generate Data Source', () => {
  const schematicRunner = new SchematicTestRunner(
    '@criticalmanufacturing/ngx-schematics',
    require.resolve('../collection.json')
  );

  const workspaceOptions = {
    name: 'workspace',
    newProjectRoot: 'projects',
    version: '10.0.0'
  };

  const appOptions = {
    name: 'app',
    inlineStyle: false,
    inlineTemplate: false,
    routing: false,
    skipTests: false,
    skipPackageJson: false
  };

  const libraryOptions = {
    name: 'testlib',
    skipPackageJson: false,
    skipTsConfig: false,
    skipInstall: false
  };

  const dataSourceOptions = {
    name: 'test',
    project: libraryOptions.name,
    style: 'less'
  };

  const defaultDataSourceFilePath = `projects/${libraryOptions.name}/src/lib/${dataSourceOptions.name}-data-source/${dataSourceOptions.name}-data-source.service.ts`;
  const defaultDataSourceSettingsComponentFilePath = `projects/${libraryOptions.name}/src/lib/${dataSourceOptions.name}-data-source/${dataSourceOptions.name}-data-source-settings/${dataSourceOptions.name}-data-source-settings.component`;

  let appTree: UnitTestTree;

  beforeEach(async () => {
    appTree = await schematicRunner.runExternalSchematic(
      '@schematics/angular',
      'workspace',
      workspaceOptions
    );

    appTree = await schematicRunner.runExternalSchematic(
      '@schematics/angular',
      'application',
      appOptions,
      appTree
    );

    appTree = await schematicRunner.runSchematic('library', libraryOptions, appTree);
  });

  it('should create the data source files', async () => {
    const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

    const files = getAllFilesFromDir(
      `projects/${libraryOptions.name}/src/lib/${dataSourceOptions.name}-data-source`,
      tree
    );

    expect(files).toEqual(
      jasmine.arrayContaining([
        `${defaultDataSourceSettingsComponentFilePath}.html`,
        `${defaultDataSourceSettingsComponentFilePath}.ts`,
        `${defaultDataSourceSettingsComponentFilePath}.less`,
        defaultDataSourceFilePath
      ])
    );
  });

  it('should create the data source style file with other extension', async () => {
    const options = { ...dataSourceOptions, style: 'css' };

    const tree = await schematicRunner.runSchematic('data-source', options, appTree);

    const files = getAllFilesFromDir(
      `projects/${libraryOptions.name}/src/lib/${dataSourceOptions.name}-data-source/${dataSourceOptions.name}-data-source-settings`,
      tree
    );

    expect(files).toEqual(
      jasmine.arrayContaining([`${defaultDataSourceSettingsComponentFilePath}.css`])
    );
  });

  it('should not create the data source style file', async () => {
    const options = { ...dataSourceOptions, style: 'none' };

    const tree = await schematicRunner.runSchematic('data-source', options, appTree);

    const files = getAllFilesFromDir(
      `projects/${libraryOptions.name}/src/lib/${dataSourceOptions.name}-data-source/${dataSourceOptions.name}-data-source-settings`,
      tree
    );

    expect(files).toHaveSize(2);
    expect(files).toEqual(
      jasmine.arrayContaining([
        `${defaultDataSourceSettingsComponentFilePath}.html`,
        `${defaultDataSourceSettingsComponentFilePath}.ts`
      ])
    );
  });

  it('should have the DataSource decorator', async () => {
    const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

    const dataSourceContent = tree.readContent(defaultDataSourceFilePath);
    expect(dataSourceContent).toMatch(/@DataSource\(/);
  });

  it('should have the name and settingsComponent properties in the DataSource decorator', async () => {
    const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

    const dataSourceSettingsName = `${strings.classify(
      dataSourceOptions.name
    )}DataSourceSettingsComponent`;

    const dataSourceContent = tree.readContent(defaultDataSourceFilePath);
    expect(dataSourceContent).toContain(
      `name: $localize\`:@@${strings.dasherize(dataSourceOptions.project)}/${
        dataSourceOptions.name
      }-data-source#NAME:${strings.nameify(dataSourceOptions.name)}\``
    );
    expect(dataSourceContent).toMatch(
      new RegExp(`settingsComponent: {\\s*component: ${dataSourceSettingsName}\\s*}`, 'gm')
    );
  });

  it('should extend DataSourceGeneric and implement DataSourceSetting Def', async () => {
    const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

    const dataSourceClassName = `${strings.classify(dataSourceOptions.name)}DataSource`;

    const dataSourceContent = tree.readContent(defaultDataSourceFilePath);
    expect(dataSourceContent).toContain(
      `export class ${dataSourceClassName} extends DataSourceGeneric implements DataSourceSettingsDef {`
    );
  });

  it('should have the constructor receiving the UtilService and providing it to the super', async () => {
    const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

    const dataSourceContent = tree.readContent(defaultDataSourceFilePath);
    expect(dataSourceContent).toMatch(/constructor\(util: UtilService\) {\s*super\(util\);\s*}/gm);
  });

  it('should have the function `execute` declared', async () => {
    const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

    const dataSourceContent = tree.readContent(defaultDataSourceFilePath);
    expect(dataSourceContent).toContain(
      'public async execute(): Promise<DataSourceExecutionOutput | void> {'
    );
  });

  describe('- Generate Data Source Settings', () => {
    it('should create the data source settings file', async () => {
      const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

      const files = getAllFilesFromDir(
        `projects/${libraryOptions.name}/src/lib/${dataSourceOptions.name}-data-source/${dataSourceOptions.name}-data-source-settings`,
        tree
      );

      expect(files).toEqual(
        jasmine.arrayContaining([
          `${defaultDataSourceSettingsComponentFilePath}.html`,
          `${defaultDataSourceSettingsComponentFilePath}.ts`,
          `${defaultDataSourceSettingsComponentFilePath}.less`
        ])
      );
    });

    it('should generate the html file with `cmf-core-dashboards-datasource-settings` component selector', async () => {
      const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

      const dataSourceName = strings.nameify(dataSourceOptions.name);
      const templateRegExp = new RegExp(
        `<cmf-core-dashboards-datasource-settings\\s*\\` +
          `[updatedSettings\\]="settings"\\s*` +
          `\\(onLoadSettings\\)="onLoadSettings\\(\\$event\\)">\\s*` +
          `${dataSourceName} Data Source Settings Works!\\s*` +
          `<\/cmf-core-dashboards-datasource-settings>`,
        'gm'
      );

      const dataSourceSettingsTemplateContent = tree.readContent(
        `${defaultDataSourceSettingsComponentFilePath}.html`
      );
      expect(dataSourceSettingsTemplateContent).toMatch(templateRegExp);
    });

    it('should generate the style file empty', async () => {
      const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

      const dataSourceSettingsStyleContent = tree.readContent(
        `${defaultDataSourceSettingsComponentFilePath}.less`
      );
      expect(dataSourceSettingsStyleContent).toEqual('');
    });

    it('should have the Component decorator with properties selector, templateUrl, and styleUrls', async () => {
      const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

      const dataSourceSettingsContent = tree.readContent(
        `${defaultDataSourceSettingsComponentFilePath}.ts`
      );
      expect(dataSourceSettingsContent).toMatch(/@Component\(/);
      expect(dataSourceSettingsContent).toContain(`standalone: true`);
      expect(dataSourceSettingsContent).toContain(
        `selector: '${strings.dasherize(dataSourceOptions.project)}-${strings.dasherize(
          dataSourceOptions.name
        )}-data-source-settings'`
      );
      expect(dataSourceSettingsContent).toMatch(
        /imports: \[\s*((CommonModule|DataSourceSettingsModule)\s*,?\s*){2}\]/gm
      );
      expect(dataSourceSettingsContent).toContain(
        `templateUrl: './${strings.dasherize(
          dataSourceOptions.name
        )}-data-source-settings.component.html'`
      );
      expect(dataSourceSettingsContent).toContain(
        `styleUrls: ['./${strings.dasherize(
          dataSourceOptions.name
        )}-data-source-settings.component.less']`
      );
    });

    it('should have the Component decorator having a different extension for the style file', async () => {
      const options = { ...dataSourceOptions, style: 'css' };

      const tree = await schematicRunner.runSchematic('data-source', options, appTree);

      const dataSourceSettingsContent = tree.readContent(
        `${defaultDataSourceSettingsComponentFilePath}.ts`
      );
      expect(dataSourceSettingsContent).toContain(
        `styleUrls: ['./${strings.dasherize(
          dataSourceOptions.name
        )}-data-source-settings.component.${options.style}']`
      );
    });

    it('should have the Component decorator without property styleUrls', async () => {
      const options = { ...dataSourceOptions, style: 'none' };

      const tree = await schematicRunner.runSchematic('data-source', options, appTree);

      const dataSourceSettingsContent = tree.readContent(
        `${defaultDataSourceSettingsComponentFilePath}.ts`
      );
      expect(dataSourceSettingsContent)
        .withContext('The styleUrls should not be fulfilled')
        .not.toMatch(/styleUrls: \['.\/(\w*-*)+.component.\w*'\]/);
    });

    it('should extend CustomizableComponent', async () => {
      const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

      const dataSourceSettingsClassName = `${strings.classify(
        dataSourceOptions.name
      )}DataSourceSettingsComponent`;

      const dataSourceSettingsContent = tree.readContent(
        `${defaultDataSourceSettingsComponentFilePath}.ts`
      );
      expect(dataSourceSettingsContent).toContain(
        `export class ${dataSourceSettingsClassName} extends CustomizableComponent {`
      );
    });

    it('should have the constructor receiving the ViewContainerRef and providing it to the super', async () => {
      const tree = await schematicRunner.runSchematic('data-source', dataSourceOptions, appTree);

      const dataSourceSettingsContent = tree.readContent(
        `${defaultDataSourceSettingsComponentFilePath}.ts`
      );
      expect(dataSourceSettingsContent).toMatch(
        /constructor\(viewContainerRef: ViewContainerRef\) {\s*super\(viewContainerRef\);\s*}/gm
      );
    });
  });
});
