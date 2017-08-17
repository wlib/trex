const gulp = require("gulp");
const rollup = require("gulp-better-rollup");
const ts = require("gulp-typescript");
const rename = require("gulp-rename");

// Uses Rollup to resolve dependencies and TypeScript to transpile the result
gulp.task("default", () =>
  gulp
    .src("src/index.js")
    .pipe(
      rollup({
        moduleName: "trex",
        format: "umd"
      })
    )
    .pipe(
      ts({
        allowJs: true,
        // Change this to whatever you want
        target: "es5"
      })
    )
    // Formatted code
    .pipe(rename("index.js"))
    .pipe(gulp.dest("./"))
);

// For development: run `gulp watch` to build on file save
gulp.task("watch", () => gulp.watch("src/**/*.js", ["default"]));
