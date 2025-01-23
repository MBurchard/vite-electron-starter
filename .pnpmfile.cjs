module.exports = {
  hooks: {
    readPackage: (pkg) => {
      if (pkg.optionalDependencies) {
        delete pkg.optionalDependencies['better-sqlite3'];
        delete pkg.optionalDependencies['@types/better-sqlite3'];
      }
      return pkg;
    },
  },
};
