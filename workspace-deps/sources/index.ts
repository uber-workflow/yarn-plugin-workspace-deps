import {
  LocatorHash,
  Plugin,
  Hooks,
  MessageName,
} from "@yarnpkg/core";

import {
  Filename,
  ppath,
} from "@yarnpkg/fslib";

import {promisify} from 'util';
import {writeFile, readFile, exists as fileExists} from "fs";

const write = promisify(writeFile);
const read = promisify(readFile)
const exists = promisify(fileExists);

const plugin: Plugin<Hooks> = {
  hooks: {
    afterAllInstalled: async (project, installOptions) => {
      const { report } = installOptions
      await report.startTimerPromise('Generating workspace-deps.txt', async () => {
        await Promise.all(project.workspaces.map(async workspace => {
          let locatorHashEntries = new Set<LocatorHash>(); // set of locatorHash 
          for (const [identHash, descriptor] of workspace.dependencies) {
            locatorHashEntries.add(project.storedResolutions.get(descriptor.descriptorHash));
          }
          for (const depLocatorHash of locatorHashEntries) {
            const pkg = project.storedPackages.get(depLocatorHash);
            for (const [identHash, descriptor] of pkg.dependencies) {
              locatorHashEntries.add(project.storedResolutions.get(descriptor.descriptorHash));
            }
          }
          const workspaceDepsContent = '// @generated\n' + Array.from(locatorHashEntries).map(locatorHash => {
            const pkg = project.storedPackages.get(locatorHash);
            const name = pkg.scope ? `@${pkg.scope}/${pkg.name}` : pkg.name;
            return `${name}:${pkg.version}`;
          }).sort().join('\n');
          const outputFilePath = ppath.join(workspace.cwd, 'workspace-deps.txt' as Filename);
          if (installOptions.immutable) {
            if (!await exists(outputFilePath)) {
              throw new Error(`Need to create workspace-deps.txt file for ${workspace.cwd}, but --immutable flag was passed`);
            }
            const contents = await read(outputFilePath, 'utf-8');
            if (contents !== workspaceDepsContent) {
              throw new Error(`Workspace ${workspace.cwd} needs to update workspace-deps.txt file, but --immutable flag was passed`);
            }
          }
          await write(outputFilePath, workspaceDepsContent);
        }))
      })
    },
  },
};

export default plugin;
