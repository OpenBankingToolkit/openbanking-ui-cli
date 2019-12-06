const path = require("path");
const child_process = require("child_process");
const fs = require("fs-extra");
const _merge = require("lodash/merge");
const terminal = require("@angular-devkit/core").terminal;
const mergedirs = require("merge-dirs").default;
const { generateIndexHtml } = require("./indexHtml/index");

const PACKAGE_ROOT = process.cwd();

async function mergeConfig(files) {
  if (Array.isArray(files)) {
    const contentToMerge = [];
    await asyncForEach(files, async file => {
      const content = await getJSONContentFromJsOrJSON(
        path.join(PACKAGE_ROOT, file)
      );
      contentToMerge.push(content);
    });
    return _merge(...contentToMerge);
  } else {
    return getJSONContentFromJsOrJSON(path.join(PACKAGE_ROOT, files));
  }
}

async function getJSONContentFromJsOrJSON(srcPath) {
  await fs.pathExists(srcPath);
  const ext = path.extname(srcPath);
  if (ext === ".json") {
    return await fs.readJson(srcPath);
  } else if (ext === ".js") {
    return require(srcPath);
  }
  throw new Error(
    "config files should be either .json or .js with module.exports"
  );
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

const getDirectories = source =>
  fs
    .readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

let _processes = [];
function exec(options, cmd, args) {
  let stdout = "";
  let stderr = "";
  const cwd = process.cwd();
  const env = options.env;
  console.log(
    `==========================================================================================`
  );

  args = args.filter(x => x !== undefined);
  const flags = [
    options.silent && "silent",
    options.waitForMatch && `matching(${options.waitForMatch})`
  ]
    .filter(x => !!x) // Remove false and undefined.
    .join(", ")
    .replace(/^(.+)$/, " [$1]"); // Proper formatting.

  console.log(
    terminal.blue(
      `Running \`${cmd} ${args.map(x => `"${x}"`).join(" ")}\`${flags}...`
    )
  );
  console.log(terminal.blue(`CWD: ${cwd}`));
  console.log(terminal.blue(`ENV: ${JSON.stringify(env)}`));
  const spawnOptions = {
    cwd,
    ...(env ? { env } : {})
  };

  if (process.platform.startsWith("win")) {
    args.unshift("/c", cmd);
    cmd = "cmd.exe";
    spawnOptions["stdio"] = "pipe";
  }

  const childProcess = child_process.spawn(cmd, args, spawnOptions);
  childProcess.stdout.on("data", data => {
    stdout += data.toString("utf-8");
    if (options.silent) {
      return;
    }
    data
      .toString("utf-8")
      .split(/[\n\r]+/)
      .filter(line => line !== "")
      .forEach(line => console.log("  " + line));
  });
  childProcess.stderr.on("data", data => {
    stderr += data.toString("utf-8");
    if (options.silent) {
      return;
    }
    data
      .toString("utf-8")
      .split(/[\n\r]+/)
      .filter(line => line !== "")
      .forEach(line => console.error(terminal.yellow("  " + line)));
  });

  _processes.push(childProcess);

  // Create the error here so the stack shows who called this function.
  const err = new Error(
    `Running "${cmd} ${args.join(" ")}" returned error code `
  );
  return new Promise((resolve, reject) => {
    childProcess.on("exit", error => {
      _processes = _processes.filter(p => p !== childProcess);

      if (!error) {
        resolve({ stdout, stderr });
      } else {
        err.message += `${error}...\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n`;
        reject(err);
      }
    });

    if (options.waitForMatch) {
      const match = options.waitForMatch;
      childProcess.stdout.on("data", data => {
        if (data.toString().match(match)) {
          resolve({ stdout, stderr });
        }
      });
      childProcess.stderr.on("data", data => {
        if (data.toString().match(match)) {
          resolve({ stdout, stderr });
        }
      });
    }
  });
}

async function postBuild(app, customer) {
  const forgerockAppPath = path.join(PACKAGE_ROOT, `dist/forgerock`);
  const forgerockAppStats = path.join(forgerockAppPath, "stats.json");

  // making sure dist/forgerock exists
  await fs.access(forgerockAppPath);
  await fs.access(forgerockAppStats);
  // get the assets that we need to include in our index.html
  const { assetsByChunkName } = await fs.readJson(forgerockAppStats);

  if (customer === "forgerock") {
    // extract forgerock conf and write file
    const forgerockConfig = require(path.join(
      PACKAGE_ROOT,
      `/projects/${app}/docker/deployment-settings.js`
    ));
    await fs.writeJson(
      path.join(forgerockAppPath, "deployment-settings.json"),
      forgerockConfig
    );

    // Generate index.html and write file
    const generatedIndexHtml = await generateIndexHtml(
      app,
      customer,
      assetsByChunkName
    );
    await fs.writeFile(
      path.join(forgerockAppPath, "index.html"),
      generatedIndexHtml
    );
  } else {
    const customerAppPath = path.join(PACKAGE_ROOT, `dist/${customer}`);
    const customerAppCopyPath = path.join(
      PACKAGE_ROOT,
      `dist/${customer}-temp`
    );

    // making sure both our targets are present in the file system
    await fs.access(customerAppPath);

    // Move the customer app
    await fs.move(customerAppPath, customerAppCopyPath, { overwrite: true });

    // Copy the foregerock app to the customer app target path
    await fs.copy(forgerockAppPath, customerAppPath);

    // Overwrite foregerock's assets with customer's assets
    mergeAssetsFolders(customer, app);

    // Generate index.html and write file
    const generatedIndexHtml = await generateIndexHtml(
      app,
      customer,
      assetsByChunkName
    );
    await fs.writeFile(
      path.join(customerAppPath, "index.html"),
      generatedIndexHtml
    );

    const newConfig = mergeDeploymentSettings(customer, app);
    await fs.writeJson(
      path.join(customerAppPath, "deployment-settings.json"),
      newConfig
    );

    // Replace existing forgerock CSS by customer generated CSS
    await fs.copy(
      path.join(customerAppCopyPath, "styles.css"),
      path.join(customerAppPath, assetsByChunkName.styles)
    );

    // cleanup the temp app
    await fs.remove(customerAppCopyPath);
  }
}

function mergeDeploymentSettings(customer, app) {
  const dockerDeploymentSettings = path.join(
    PACKAGE_ROOT,
    `/projects/${app}/docker/deployment-settings.js`
  );
  const customerDeploymentSettings = path.join(
    PACKAGE_ROOT,
    `/themes/${customer}/deployment-settings.js`
  );
  const {
    defaultSettings = {},
    appsSettings = {}
  } = require(customerDeploymentSettings);
  return _merge(
    {},
    require(dockerDeploymentSettings),
    defaultSettings,
    appsSettings[app]
  );
}

function mergeAssetsFolders(customer, app) {
  const destination = path.join(PACKAGE_ROOT, `dist/${customer}/assets`);
  const customerAssetsPath = path.join(
    PACKAGE_ROOT,
    `/themes/${customer}/assets`
  );
  const customerAppAssetsPath = path.join(
    PACKAGE_ROOT,
    `/themes/${customer}/apps/${app}/assets`
  );

  mergedirs(customerAssetsPath, destination, "overwrite");

  // Allow specific assets per app if needed
  if (fs.existsSync(customerAppAssetsPath)) {
    mergedirs(customerAppAssetsPath, destination, "overwrite");
  }
}

module.exports = {
  mergeConfig,
  asyncForEach,
  getDirectories,
  exec,
  postBuild
};
