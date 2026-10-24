# `tent map`

Prints the whole app as a short outline: each table with its columns and its rules, each function with its inputs, its rule and its form, each flow with what starts it and its steps, each package the project imports, each screen with what it reads, calls and draws, and the bytes of each file that a page loads of the project. So a model that reads the map knows what is in the app, whatever was added.

## Usage

```
tent map
```

The project is built for release first, so that what each package weighs in the page is known; a project that cannot be built is outlined as it is described, with the findings that stop the build.

## Example

```
myApp
tables
  sales: month number, amount number
    read anyone, add anyone
functions
  query allSales(): anyone, plain
  change addSale(month number, amount number): anyone, plain
  action saleWords(month number): anyone, code
packages
  month-words: screens homeScreen; backend functions/sales.ts; browser 248 bytes
  net-reader: backend functions/sales.ts; reaches net
  tiny-bars: screens homeScreen; browser 211 bytes
screens
  homeScreen: /, anyone
    data: sales from allSales
    calls: addSale
    components: BarLine of tiny-bars
page
  styles: browser/styles.884c91245160.css 7111 bytes
  screen homeScreen: browser/screens.home.426828b3de21.js 1240 bytes
```

**A package** is told with who uses it - the screens and the components that draw with it, the backend files and the other files that import it - whether it reaches a browser, with the bytes it stands for in the modules a browser loads, and the ways out of the computer that its code takes, as the modules of the runtime it imports say: `net` for a connection, `programs` for a program or a worker, `files` for a file of the computer, `native` for a native module. A package that sends data out by its own means past them is not seen; `hold` of `project` holds what code may reach (`option.project.hold`).

**A screen** is told with its address and its rule, each entry of its `data` with the query or the action it reads, the functions it calls, and the components it draws: the project's own by their names, and those of a package with the package.

**The page** tells the bytes of each file that a browser loads of the project: the style files of the project, and the module of each screen and each component that has one, with the style files that it brings. A page loads the module of the screen it shows, and of a component when it draws it.

## Output

With `--json`:

```json
{ "ok": true, "value": "myApp\ntables\n  ...", "findings": [] }
```

## See also

`command.check`, `command.build`, `topic.screens`, `topic.commands`
