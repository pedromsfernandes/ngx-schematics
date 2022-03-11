import { strings } from '@angular-devkit/core';
import { apply, applyTemplates, chain, mergeWith, move, Rule, SchematicContext, SchematicsException, Tree, url } from '@angular-devkit/schematics';
import { parseName } from '@schematics/angular/utility/parse-name';
import { buildDefaultPath, getWorkspace } from '@schematics/angular/utility/workspace';
import { updatePublicAPI } from '../utility/rule';
import { nameify } from '../utility/string';

export default function (_options: any): Rule {
  return async (tree: Tree, _context: SchematicContext) => {
    const workspace = await getWorkspace(tree);
    const project = workspace.projects.get(_options.project as string);

    if (!project) {
      throw new SchematicsException(`Project "${_options.project}" does not exist.`);
    }

    if (_options.path === undefined) {
      _options.path = buildDefaultPath(project);
    }

    const parsedPath = parseName(_options.path as string, _options.name);
    _options.name = parsedPath.name;
    _options.path = parsedPath.path;

    const templateSource = apply(url('./files'), [
      applyTemplates({
        ...strings,
        ..._options,
        nameify,
        project: project?.prefix ?? _options.project
      }),
      move(parsedPath.path)
    ]);

    return chain([
      mergeWith(templateSource),
      updatePublicAPI(project, `${nameify(_options.name)} Converter`)
    ]);
  }
}