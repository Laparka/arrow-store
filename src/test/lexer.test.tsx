import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import assert, {throws} from "assert";
import {CLOCK_TYPE, ClockRecord} from "./models";

let iteratedTimes = 1;
let index = 0;
const iterate = () => {
    if (iteratedTimes % 2 === 0 && iteratedTimes !== 0) {
        index++;
    }

    iteratedTimes++;
    return index;
};

test('Must return empty tokens', () => {
    const lexer = LambdaPredicateLexer.Instance;
    assert(lexer.tokenize("").length === 0);
    assert(lexer.tokenize("           ").length === 0);
    assert(lexer.tokenize("   \r\n   \n     ").length === 0);
});

test('Must throw exception when not a lambda expression', () => {
    const lexer = LambdaPredicateLexer.Instance;
    throws(() => lexer.tokenize("() => {return true}"));
    throws(() => lexer.tokenize("function() {return true}"));
});

test('Must tokenize the lambda expression', () => {
    const clockType: CLOCK_TYPE = 'Analog';
    const theMostShittyBrand = 'Gar';
    const lexer = LambdaPredicateLexer.Instance;
    const predicate: (value: ClockRecord) => boolean =
        x => !(x.brand === 'LG' || x.brand === `${theMostShittyBrand}\'ang`) &&
            ((x.clockType === 'Digital' && x.totalSegments !== 12) || x.clockType === clockType && x.clockModel === 'FTW\'1194' && x.brand === 'Fossil')
    const tokens = lexer.tokenize(predicate.toString());

    iteratedTimes = 0;
    index = 0;
    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'x'.length);

    assert(tokens[iterate()].tokenType === 'LambdaInitializer');
    assert(tokens[iterate()].length === '=>'.length);

    assert(tokens[iterate()].tokenType === 'Inverse');
    assert(tokens[iterate()].length === '!'.length);

    assert(tokens[iterate()].tokenType === 'GroupStart');
    assert(tokens[iterate()].length === '('.length);

    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'x.brand'.length);

    assert(tokens[iterate()].tokenType === 'Equals');
    assert(tokens[iterate()].length === '==='.length);

    assert(tokens[iterate()].tokenType === 'String');
    assert(tokens[iterate()].length === `'LG'`.length);

    assert(tokens[iterate()].tokenType === 'Or');
    assert(tokens[iterate()].length === `||`.length);

    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'x.brand'.length);

    assert(tokens[iterate()].tokenType === 'Equals');
    assert(tokens[iterate()].length === '==='.length);

    assert(tokens[iterate()].tokenType === 'String');
    assert(tokens[iterate()].length === '`${theMostShittyBrand}\\\'ang`'.length);

    assert(tokens[iterate()].tokenType === 'GroupEnd');
    assert(tokens[iterate()].length === ')'.length);

    assert(tokens[iterate()].tokenType === 'And');
    assert(tokens[iterate()].length === `&&`.length);

    assert(tokens[iterate()].tokenType === 'GroupStart');
    assert(tokens[iterate()].length === '('.length);

    assert(tokens[iterate()].tokenType === 'GroupStart');
    assert(tokens[iterate()].length === '('.length);

    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'x.clockType'.length);

    assert(tokens[iterate()].tokenType === 'Equals');
    assert(tokens[iterate()].length === '==='.length);

    assert(tokens[iterate()].tokenType === 'String');
    assert(tokens[iterate()].length === `'Digital'`.length);

    assert(tokens[iterate()].tokenType === 'And');
    assert(tokens[iterate()].length === `&&`.length);

    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'x.totalSegments'.length);

    assert(tokens[iterate()].tokenType === 'NotEquals');
    assert(tokens[iterate()].length === '!=='.length);

    assert(tokens[iterate()].tokenType === 'Number');
    assert(tokens[iterate()].length === '12'.length);

    assert(tokens[iterate()].tokenType === 'GroupEnd');
    assert(tokens[iterate()].length === ')'.length);

    assert(tokens[iterate()].tokenType === 'Or');
    assert(tokens[iterate()].length === `||`.length);

    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'x.clockType'.length);

    assert(tokens[iterate()].tokenType === 'Equals');
    assert(tokens[iterate()].length === '==='.length);

    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'clockType'.length);

    assert(tokens[iterate()].tokenType === 'And');
    assert(tokens[iterate()].length === `&&`.length);

    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'x.clockModel'.length);

    assert(tokens[iterate()].tokenType === 'Equals');
    assert(tokens[iterate()].length === '==='.length);

    assert(tokens[iterate()].tokenType === 'String');
    assert(tokens[iterate()].length === `'FTW\\'1194'`.length);

    // && x.brand === 'Fossil'
    assert(tokens[iterate()].tokenType === 'And');
    assert(tokens[iterate()].length === `&&`.length);

    assert(tokens[iterate()].tokenType === 'Object');
    assert(tokens[iterate()].length === 'x.brand'.length);

    assert(tokens[iterate()].tokenType === 'Equals');
    assert(tokens[iterate()].length === '==='.length);

    assert(tokens[iterate()].tokenType === 'String');
    assert(tokens[iterate()].length === `'Fossil'`.length);

    assert(tokens[iterate()].tokenType === 'GroupEnd');
    assert(tokens[iterate()].length === ')'.length);
});
