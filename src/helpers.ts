import invariant from "invariant";
import pluralize from "pluralize";

// Lower-case the first letter of `s`.
export function lowerFirst(s: string) {
  invariant(s.length > 0, "string is empty");
  return s.replace(/^\w/, (c) => c.toLowerCase());
}

// Create various inflections of an entity name.
export class InflectionTable {
  entityUpper: string;
  entityLower: string;
  entityUpperPlural: string;
  entityLowerPlural: string;
  entityAllUpper: string;
  entityAllUpperPlural: string;

  constructor(name: string) {
    invariant(/^[A-Z][A-Za-z]*$/.test(name), `invalid name '${name}'`);

    this.entityUpper = name;
    this.entityLower = lowerFirst(this.entityUpper);
    this.entityUpperPlural = pluralize(this.entityUpper);
    this.entityLowerPlural = pluralize(this.entityLower);
    this.entityAllUpper = this.entityLower.toUpperCase();
    this.entityAllUpperPlural = this.entityLowerPlural.toUpperCase();
  }
}

export function union<T>(setA: Set<T>, setB: Set<T>) {
  let _union = new Set<T>(setA)
  for (let elem of setB) {
    _union.add(elem)
  }
  return _union
}

// Credits:
// https://joshtronic.com/2016/02/14/how-to-capitalize-the-first-letter-in-a-string-in-javascript/
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set