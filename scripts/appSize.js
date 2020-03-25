#!/usr/bin/node

const path = require("path");
const fs = require("fs-extra");
const minimist = require("minimist");
const gzipSize = require("gzip-size");
const sortBy = require("lodash/sortBy");
const asyncForEach = require("./utils").asyncForEach;
const exec = require("./utils").exec;

const options = minimist(process.argv.slice(2));
const PACKAGE_ROOT = process.cwd();

module.exports = async function run() {
  try {
    if (!options.theme) {
      throw new Error("missing --theme option");
    }

    if (!options.project) {
      throw new Error("missing --project option");
    }

    const { theme, project } = options;

    await exec({ silent: true }, "ng", [
      "build",
      "--project",
      project,
      "--configuration",
      theme,
      "--output-path",
      `dist/${theme}`,
      "--extra-webpack-config",
      "webpack.extra.js",
      "--statsJson"
    ]);

    const distAppPath = path.join(PACKAGE_ROOT, `dist/${options.theme}`);
    const distStatsPath = path.join(distAppPath, "stats.json");

    // making sure dist/forgerock exists
    await fs.access(distAppPath);
    await fs.access(distStatsPath);
    // get the assets that we need to include in our index.html
    let { assets } = await fs.readJson(distStatsPath);
    // console.log(assets);
    assets = assets.filter(asset => asset.name.endsWith(".js"));

    const stats = [];
    await asyncForEach(assets, async asset => {
      const gzippedSize = await gzipSize.file(
        path.join(distAppPath, asset.name)
      );
      stats.push({
        name: asset.name.split(".")[0],
        size: asset.size,
        gzippedSize
      });
    });

    sortBy(stats, "gzippedSize")
      .reverse()
      .map(asset =>
        console.log(`${asset.name};${asset.size};${asset.gzippedSize}`)
      );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
