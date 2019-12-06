#!/usr/bin/env node

const minimist = require("minimist");

module.exports = () => {
  const args = minimist(process.argv.slice(2));

  let cmd = args._[0] || "help";

  if (args.help || args.h) {
    cmd = "help";
  }

  switch (cmd) {
    case "newTheme":
      require("./scripts/themesBuild")(args);
      break;

    case "help":
      const menus = {
        main: `
            openbanking-ui-cli [command] <options>

            newTheme ........... Add a new theme based on a customization json
              `,

        newTheme: `
            openbanking-ui-cli newTheme <options>
          
            --project ..... the app name`
      };
      console.log(menus[cmd] || menus.main);
      break;

    default:
      console.error(`"${cmd}" is not a valid command!`);
      break;
  }
};
