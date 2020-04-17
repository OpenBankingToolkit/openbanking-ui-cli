#!/usr/bin/env node

const fs = require("fs-extra"),
  path = require("path"),
  ejs = require("ejs"),
  minimist = require("minimist"),
  favicons = require("favicons"),
  svg2img = require("svg2img"),
  options = minimist(process.argv.slice(2)),
  _get = require("lodash/get"),
  _kebabCase = require("lodash/kebabCase");

const PACKAGE_ROOT = process.cwd(),
  THEMES_FOLDER = path.join(PACKAGE_ROOT, options.outputFolder || "themes");

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

    if (options.customizationPath) {
      // making sure customization path exists
      await fs.access(options.customizationPath);
      const { theme, imgs, metadata = {}, customer = {} } = await fs.readJson(
        options.customizationPath
      );

      // Copy customization.json file to be able to rerun
      await fs.copy(
        options.customizationPath,
        path.join(THEMES_FOLDER, themeName, "customization.json")
      );

      await handleTheme(themeName, theme);
      await handleImages(themeName, imgs);
      const favicons = await exportFavicons(
        themeName,
        _get(imgs, "favicon.file"),
        {
          name: customer.name,
          description: metadata.description,
        }
      );
      await exportSplashscreen(themeName, {
        colors: {
          background: theme["--palette-background-background"]
            ? `rgba(${theme["--palette-background-background"]}, ${
                theme["--palette-background-background-alpha"] || 1
              })`
            : "",
          spinner: theme["--palette-primary-500"]
            ? `rgba(${theme["--palette-primary-500"]}, ${
                theme["--palette-primary-500-alpha"] || 1
              })`
            : "",
        },
      });
      await exportBuildSettings(themeName, { metadata, favicons });
      await exportDeploymentSettings(themeName, { customer });
    }
  } catch (error) {
    console.error(error);
  }
};

function svgToBuffer(favicon) {
  return new Promise((res, rej) => {
    svg2img(favicon, (error, buffer) => {
      if (error) rej(error);
      res(buffer);
    });
  });
}
async function exportFavicons(themeName, favicon, { name, description }) {
  if (!favicon) {
    console.info("Favicons will not be created");
    return Promise.resolve("");
  }
  const fileBuffer = await svgToBuffer(favicon);
  const faviconsPath = "/assets/favicons";
  return new Promise((res, rej) => {
    favicons(
      fileBuffer,
      {
        path: faviconsPath, // Path for overriding default icons path. `string`
        appName: name || null, // Your application's name. `string`
        appShortName: name || null, // Your application's short_name. `string`. Optional. If not set, appName will be used
        appDescription: description || null, // Your application's description. `string`
        developerName: null, // Your (or your developer's) name. `string`
        developerURL: null, // Your (or your developer's) URL. `string`
        dir: "auto", // Primary text direction for name, short_name, and description
        lang: "en-US", // Primary language for name and short_name
        background: "#fff", // Background colour for flattened icons. `string`
        theme_color: "#fff", // Theme color user for example in Android's task switcher. `string`
        appleStatusBarStyle: "black-translucent", // Style for Apple status bar: "black-translucent", "default", "black". `string`
        display: "standalone", // Preferred display mode: "fullscreen", "standalone", "minimal-ui" or "browser". `string`
        orientation: "any", // Default orientation: "any", "natural", "portrait" or "landscape". `string`
        scope: "/", // set of URLs that the browser considers within your app
        start_url: "/?homescreen=1", // Start URL when launching the application from a device. `string`
        version: "1.0", // Your application's version string. `string`
        logging: false, // Print logs to console? `boolean`
        pixel_art: false, // Keeps pixels "sharp" when scaling up, for pixel art.  Only supported in offline mode.
        loadManifestWithCredentials: false, // Browsers don't send cookies when fetching a manifest, enable this to fix that. `boolean`
        icons: {
          android: true, // Create Android homescreen icon. `boolean` or `{ offset, background, mask, overlayGlow, overlayShadow }`
          appleIcon: true, // Create Apple touch icons. `boolean` or `{ offset, background, mask, overlayGlow, overlayShadow }`
          appleStartup: false, // Create Apple startup images. `boolean` or `{ offset, background, mask, overlayGlow, overlayShadow }`
          coast: false, // Create Opera Coast icon. `boolean` or `{ offset, background, mask, overlayGlow, overlayShadow }`
          favicons: true, // Create regular favicons. `boolean` or `{ offset, background, mask, overlayGlow, overlayShadow }`
          firefox: false, // Create Firefox OS icons. `boolean` or `{ offset, background, mask, overlayGlow, overlayShadow }`
          windows: false, // Create Windows 8 tile icons. `boolean` or `{ offset, background, mask, overlayGlow, overlayShadow }`
          yandex: false, // Create Yandex browser icon. `boolean` or `{ offset, background, mask, overlayGlow, overlayShadow }`
        },
      },
      async (error, response) => {
        if (error) {
          console.log(error.message); // Error description e.g. "An unknown error has occurred"
          rej(error);
        }
        [...response.images, ...response.files].forEach(
          async ({ name, contents }) => {
            const outputPath = path.join(
              THEMES_FOLDER,
              themeName,
              faviconsPath,
              name
            );
            await fs.outputFile(outputPath, contents);
            console.info(`${outputPath} created`);
          }
        );
        res(response.html.join(""));
      }
    );
  });

  console.info(`${outputPath} created`);
}

async function exportTemplate(inputPath, outputPath, templateData) {
  await fs.access(inputPath);

  const templateContent = await fs.readFile(inputPath);

  await fs.outputFile(
    outputPath,
    ejs.render(templateContent.toString(), templateData)
  );
  console.info(`${outputPath} created`);
}

async function exportSplashscreen(themeName, templateData) {
  await exportTemplate(
    path.join(__dirname, "splashscreen.template"),
    path.join(THEMES_FOLDER, themeName, "assets/splashscreen.css"),
    templateData
  );
}

async function exportBuildSettings(themeName, templateData) {
  await exportTemplate(
    path.join(__dirname, "build-settings.template"),
    path.join(THEMES_FOLDER, themeName, "build-settings.js"),
    templateData
  );
}

async function exportDeploymentSettings(themeName, templateData) {
  await exportTemplate(
    path.join(__dirname, "deployment-settings.template"),
    path.join(THEMES_FOLDER, themeName, "deployment-settings.js"),
    templateData
  );
}

/**
 * Processes the contents of the customization file and outputs it as SCSS
 *
 * @param themeName
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
${
  contrast &&
  `  contrast: (
    ${contrast}
  )
`
});
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
    .filter((key) => !key.match(/(contrast|alpha)/))
    .map((key) => `${key}: rgba(${map[key]}, ${map[key + "-alpha"] || 1})`)
    .join(",\n" + Array(indent + 1).join(" "));
}

/**
 * Parses a map of CSS variables into a map of SCSS maps
 *
 * @param cssVars
 */
function parseCssVars(cssVars) {
  const cssMap = {};

  Object.keys(cssVars).forEach((key) => {
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

  if (favicon) {
    const iconPath = path.join(
      THEMES_FOLDER,
      themeName,
      "assets",
      "logos",
      "favicon.svg"
    );
    await fs.outputFile(iconPath, favicon);
    console.info(`${iconPath} created`);
  }
}
