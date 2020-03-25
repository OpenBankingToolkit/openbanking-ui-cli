#!/usr/bin/env node

const path = require("path");
const fs = require("fs-extra");
const minimist = require("minimist");
const _get = require("lodash/get");
const _set = require("lodash/set");
const asyncForEach = require("./utils").asyncForEach;
const getDirectories = require("./utils").getDirectories;
const postBuild = require("./utils").postBuild;
const exec = require("./utils").exec;

const options = minimist(process.argv.slice(2));
const PRINCIPAL_THEME = "forgerock";
const PACKAGE_ROOT = path.join(process.cwd());
const ORIGINAL_ANGULARJSON = path.join(PACKAGE_ROOT, "angular.json");
const COPY_ANGULARJSON = path.join(PACKAGE_ROOT, "angular.save.json");

process.on("SIGINT", async () => await cleanup());

module.exports = async function run(args) {
  try {
    // save original angular.json
    await fs.copy(ORIGINAL_ANGULARJSON, COPY_ANGULARJSON);

    if (!options.project) {
      throw new Error("missing --project option");
    }

    const themesPath = path.join(PACKAGE_ROOT, `themes`);
    // making sure themes folder exist
    await fs.access(themesPath);

    const themes = getDirectories(themesPath);
    // making sure forgerock theme exists
    if (!themes.includes(PRINCIPAL_THEME))
      throw new Error("Forgerock theme is necessary");

    const customers = themes.filter(customer => customer !== PRINCIPAL_THEME);

    // create angular.json on the fly using themes folder
    await updateAngularJson(ORIGINAL_ANGULARJSON, options.project, customers);

    // BUILDS forgerock first as it builds the JS
    await asyncForEach(
      [PRINCIPAL_THEME, ...customers],
      async customer => await build(options.project, customer)
    );
    // cleanup build tmp files
    await asyncForEach(
      [PRINCIPAL_THEME, ...customers],
      async customer =>
        await fs.remove(path.join(PACKAGE_ROOT, "dist", customer, "stats.json"))
    );
    await cleanup();
  } catch (error) {
    console.error(error);
    await cleanup();
  }
};

async function cleanup() {
  // putting original angular.json back
  console.log("cleaning up angular.json");
  await fs.move(COPY_ANGULARJSON, ORIGINAL_ANGULARJSON, { overwrite: true });
}

async function build(project, customer) {
  console.info(`Building ${project} for ${customer}`);
  try {
    await exec({ silent: true }, "ng", [
      "build",
      "--project",
      project,
      "--configuration",
      customer,
      "--output-path",
      `dist/${customer}`,
      "--extra-webpack-config",
      "webpack.extra.js",
      ...(customer === PRINCIPAL_THEME ? ["--statsJson"] : [])
    ]);
    await postBuild(project, customer);
  } catch (error) {
    process.exit(1);
  }
}

async function updateAngularJson(configPath, projectName, customers) {
  const angularConfig = await fs.readJson(configPath);

  const projectConfig = angularConfig.projects[projectName];
  if (projectConfig.projectType !== "application")
    throw new Error("The project needs to be an app");

  customers.forEach(customer => {
    const customerConfig = _get(
      projectConfig,
      `architect.build.configurations.${customer}`
    );
    // if already exists, we skip
    if (customerConfig) return;

    const newConfig = {
      main: `projects/${projectName}/src/index.build.ts`,
      polyfills: `projects/${projectName}/src/index.build.ts`,
      stylePreprocessorOptions: {
        includePaths: [
          `themes/${customer}/apps/analytics/scss`,
          `themes/${customer}/scss`,
          "utils/scss",
          `projects/${projectName}/src/scss`
        ]
      },
      optimization: true,
      outputHashing: "none",
      sourceMap: false,
      extractCss: true,
      projectNamedChunks: false,
      aot: false,
      extractLicenses: false,
      vendorChunk: false,
      buildOptimizer: false
    };

    _set(
      angularConfig,
      `projects.${projectName}.architect.build.configurations.${customer}`,
      newConfig
    );
  });

  await fs.writeFile(configPath, JSON.stringify(angularConfig));
  console.info(`${configPath} updated`);
}
