import invariant from "invariant";
import pluralize from "pluralize";

// Lower-case the first letter of `s`.
function lowerFirst(s: string) {
  invariant(s.length > 0, "string is empty");
  return s.replace(/^\w/, (c) => c.toLowerCase());
}

// Upper-case the first letter of `s`.
function upperFirst(s: string) {
  invariant(s.length > 0, "string is empty");
  return s.replace(/^\w/, (c) => c.toUpperCase());
}

// Create various inflections of an identifier
export default class Inflections {
  initUpperSg: string; // FooBar
  initLowerSg: string; // fooBar
  initUpperPl: string; // FooBars
  initLowerPl: string; // fooBars
  allUpperSg: string; // FOOBAR
  allUpperPl: string; // FOOBARS

  constructor(identifier: string) {
    invariant(
      /^[A-Za-z]+$/.test(identifier),
      `invalid identifier '${identifier}'`
    );

    this.initUpperSg = upperFirst(identifier);
    this.initLowerSg = lowerFirst(this.initUpperSg);
    this.initUpperPl = pluralize(this.initUpperSg);
    this.initLowerPl = pluralize(this.initLowerSg);
    this.allUpperSg = this.initLowerSg.toUpperCase();
    this.allUpperPl = this.initLowerPl.toUpperCase();
  }
}

// Credits:
// https://joshtronic.com/2016/02/14/how-to-capitalize-the-first-letter-in-a-string-in-javascript/
