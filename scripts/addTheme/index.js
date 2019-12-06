#!/usr/bin/env node

const fs = require("fs-extra"),
  path = require("path"),
  minimist = require("minimist"),
  options = minimist(process.argv.slice(2)),
  _get = require("lodash/get"),
  _kebabCase = require("lodash/kebabCase");

const PACKAGE_ROOT = process.cwd(),
  THEMES_FOLDER = path.join(PACKAGE_ROOT, "themes");

module.exports = async function run() {
  try {
    if (!options.name) {
      throw new Error("missing --name option");
    }
    const themeName = _kebabCase(options.name);

    // Copy blank assets
    await fs.copy(
      path.join(__dirname, "blank-theme"),
      path.join(THEMES_FOLDER, themeName)
    );

    if (options.customization) {
      // making sure customization path exists
      await fs.access(options.customization);
      const { theme, imgs } = await fs.readJson(options.customization);
      await handleTheme(themeName, theme);
      await handleImages(themeName, imgs);
    }
  } catch (error) {
    console.error(error);
  }
};

/**
 * Processes the contents of the theme.json customization file and outputs it as SCSS
 *
 * @param data
 * @param theme {[key: string]: string}
 */
async function handleTheme(themeName, theme) {
  const cssVars = parseCssVars(theme);

  const scss = Object.keys(cssVars).reduce((scssString, key) => {
    const contrast = getScssProps(cssVars[key]["contrast"], 4);

    return (
      scssString +
      `
$${key}-palette: (
  ${getScssProps(cssVars[key], 2)},
${contrast &&
  `  contrast: (
    ${contrast}
  )
`});
`
    );
  }, "");

  const variablesPath = path.join(
    THEMES_FOLDER,
    themeName,
    "scss",
    "_variables.scss"
  );
  await fs.outputFile(
    variablesPath,
    `
    @import '_default_variables';

    ${scss}
  `
  );
  console.info(`${variablesPath} created`);
}

/**
 * Converts a map of SCSS props into valid SCSS
 *
 * @param map
 * @param indent
 * @return {string}
 */
function getScssProps(map, indent = 0) {
  return Object.keys(map || {})
    .filter(key => !key.match(/(contrast|alpha)/))
    .map(key => `${key}: rgba(${map[key]}, ${map[key + "-alpha"] || 1})`)
    .join(",\n" + Array(indent + 1).join(" "));
}

/**
 * Parses a map of CSS variables into a map of SCSS maps
 *
 * @param cssVars
 */
function parseCssVars(cssVars) {
  const cssMap = {};

  Object.keys(cssVars).forEach(key => {
    key
      .match(/^--palette-([a-zA-Z0-9]*)-(contrast)?-?(.*)/)
      .slice(1)
      .reduce((map, subKey, i, arr) => {
        if (typeof subKey === "undefined") {
          return map;
        }

        return (map[subKey] =
          map[subKey] || (i < arr.length - 1 ? {} : cssVars[key]));
      }, cssMap);
  });
  return cssMap;
}

async function handleImages(themeName, imgs) {
  const logo = _get(imgs, "logo.file");
  const icon = _get(imgs, "icon.file");
  const favicon = _get(imgs, "favicon.file");

  if (logo) {
    const logoPath = path.join(
      THEMES_FOLDER,
      themeName,
      "assets",
      "logos",
      "logo.svg"
    );
    await fs.outputFile(logoPath, logo);
    console.info(`${logoPath} created`);
  }

  if (icon) {
    const iconPath = path.join(
      THEMES_FOLDER,
      themeName,
      "assets",
      "logos",
      "icon.svg"
    );
    await fs.outputFile(iconPath, icon);
    console.info(`${iconPath} created`);
  }
}
