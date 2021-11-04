import {ClockRecord} from "./models";
import DynamoDBExpressionParser from "../parser/dynamoExpressionParser";
import {LambdaExpressionLexer} from "../lexer/lambdaExpressionLexer";
import assert from "assert";

test('Must build AST tree for grouped expression with a function', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
    const predicate: (value: ClockRecord) => boolean = x => (x.brand.startsWith("Fos") || x.brand.length === 1) || x.clockType === 'Analog';
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    assert(lambda)
});

test('Must build AST tree for ungrouped AND and OR expression', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' && x.totalSegments === 24 || x.clockType === 'Analog';
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    assert(lambda)
});

test('Must build AST tree for ungrouped OR and AND expression', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' || x.totalSegments === 24 && x.clockType === 'Analog';
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    assert(lambda)
});

test('Must build AST tree for multiple group expressions', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' || ((x.totalSegments === 24 || x.clockType === 'Analog') && (x.clockType === 'Unknown' || x.totalSegments === 12));
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    assert(lambda)
});
