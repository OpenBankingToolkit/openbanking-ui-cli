module.exports = {
  html: {
    head: [
      {
        id: "charset",
        tag: '<meta charset="utf-8" />',
        order: 1,
      },
      {
        id: "base",
        tag: '<base href="/" />',
        order: 2,
      },
      {
        id: "title",
        tag: "<title>Forgerock App</title>",
        order: 3,
      },
      {
        id: "viewport",
        tag:
          '<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />',
      },
    ],
    body: {},
  },
};
