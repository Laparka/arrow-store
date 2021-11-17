import {ClockRecord} from "./models";
import PredicateExpressionParser from "../parser/predicateExpressionParser";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import assert from "assert";
import {
    BooleanOperationNode,
    CompareOperationNode,
    FunctionNode,
    GroupNode,
    InverseNode,
    LambdaExpressionNode,
    NumberValueNode,
    ObjectAccessorNode,
    StringValueNode
} from "../parser/nodes";

test('Must understand inverse', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = PredicateExpressionParser.Instance;
    const predicateString = "x => x.brand.startsWith(\"Fos\") || !Object.hasOwnProperty(x.brand)";
    const tokens = lexer.tokenize(predicateString);
    const expression = parser.parse(predicateString, tokens);
})
test('Must parse a non-lambda expression', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = PredicateExpressionParser.Instance;
    const predicateString = "brand && brand.startsWith(\"Fos\") || !!brand";
    const tokens = lexer.tokenize(predicateString);
    const expression = parser.parse(predicateString, tokens);
    const expected = new BooleanOperationNode(
        'Or',
        new BooleanOperationNode(
            'And',
            new ObjectAccessorNode('brand'),
            new FunctionNode('startsWith', new ObjectAccessorNode('brand'), new StringValueNode('"Fos"', true))
        ),
        new InverseNode(
            new InverseNode(
                new ObjectAccessorNode('brand')
            )
        ));
    const expect = JSON.stringify(expected);
    const actual = JSON.stringify(expression);
    assert(expect === actual);
});

test('Must build AST tree for grouped expression with a function', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = PredicateExpressionParser.Instance;
    const predicate: (value: ClockRecord) => boolean = x => (x.brand && x.brand.startsWith("Fos") || x.brand.length === 1) || x.clockType === 'Analog' && !!x.brand;
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const expectedLambda = new LambdaExpressionNode(
        new ObjectAccessorNode('x'),
        new BooleanOperationNode(
            'Or',
            new GroupNode(
                new BooleanOperationNode(
                    'Or',
                    new BooleanOperationNode(
                        'And',
                        new ObjectAccessorNode('x.brand'),
                        new FunctionNode(
                            'startsWith',
                            new ObjectAccessorNode('x.brand'),
                            new StringValueNode(`"Fos"`, true)
                        ),
                    ),
                    new CompareOperationNode(
                        'Equals',
                        new ObjectAccessorNode('x.brand.length'),
                        new NumberValueNode(1)
                    )
                )
            ), // x.clockType === 'Analog' && !!x.brand
            new BooleanOperationNode(
                'And',
                new CompareOperationNode(
                    'Equals',
                    new ObjectAccessorNode('x.clockType'),
                    new StringValueNode(`'Analog'`, true)
                ),
                new InverseNode(
                    new InverseNode(
                        new ObjectAccessorNode('x.brand')
                    )
                )
            )
        )
    )

    const actual = JSON.stringify(lambda);
    const expect = JSON.stringify(expectedLambda);
    assert(expect === actual);
});

test('Must build AST tree for ungrouped AND and OR expression', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = PredicateExpressionParser.Instance;
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' && x.totalSegments === 24 || x.clockType === 'Analog';
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const expectedLambda = new LambdaExpressionNode(
        new ObjectAccessorNode('x'),
        new BooleanOperationNode(
            'Or',
            new BooleanOperationNode(
                'And',
                new CompareOperationNode(
                    'Equals',
                    new ObjectAccessorNode('x.brand'),
                    new StringValueNode(`'Fossil'`, true)
                ),
                new CompareOperationNode(
                    'Equals',
                    new ObjectAccessorNode('x.totalSegments'),
                    new NumberValueNode(24))
            ),
            new CompareOperationNode(
                'Equals',
                new ObjectAccessorNode('x.clockType'),
                new StringValueNode(`'Analog'`, true)
            )
        ));

    const actual = JSON.stringify(lambda);
    const expect = JSON.stringify(expectedLambda);
    assert(expect === actual);
});

test('Must build AST tree for ungrouped OR and AND expression', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = PredicateExpressionParser.Instance;
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' || x.totalSegments === 24 && x.clockType === 'Analog';
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const expectedExpr = new LambdaExpressionNode(
        new ObjectAccessorNode('x'),
        new BooleanOperationNode(
            'Or',
            new CompareOperationNode(
                'Equals',
                new ObjectAccessorNode('x.brand'),
                new StringValueNode(`'Fossil'`, true)
            ),
            new BooleanOperationNode(
                'And',
                new CompareOperationNode(
                    'Equals',
                    new ObjectAccessorNode('x.totalSegments'),
                    new NumberValueNode(24)
                ),
                new CompareOperationNode(
                    'Equals',
                    new ObjectAccessorNode('x.clockType'),
                    new StringValueNode(`'Analog'`, true)
                )
            )
        )
    )

    const actual = JSON.stringify(lambda);
    const expect = JSON.stringify(expectedExpr);
    assert(expect === actual);
});

test('Must build AST tree for multiple group expressions', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = PredicateExpressionParser.Instance;
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' ||
        (
            (x.totalSegments === 24 || x.clockType === 'Analog') && (x.clockType === 'Unknown' || x.totalSegments === 12)
        );
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const expectedTree = new LambdaExpressionNode(
        new ObjectAccessorNode("x"),
        new BooleanOperationNode('Or',
            new CompareOperationNode('Equals', new ObjectAccessorNode('x.brand'), new StringValueNode(`'Fossil'`, true)),
            new GroupNode(
                new BooleanOperationNode('And',
                    new GroupNode(
                        new BooleanOperationNode(
                            'Or',
                            new CompareOperationNode(
                                'Equals',
                                new ObjectAccessorNode('x.totalSegments'),
                                new NumberValueNode(24)
                            ),
                            new CompareOperationNode(
                                'Equals',
                                new ObjectAccessorNode('x.clockType'),
                                new StringValueNode(`'Analog'`, true)
                            )
                        )
                    ),
                    new GroupNode(
                        new BooleanOperationNode(
                            'Or',
                            new CompareOperationNode(
                                'Equals',
                                new ObjectAccessorNode('x.clockType'),
                                new StringValueNode(`'Unknown'`, true)
                            ),
                            new CompareOperationNode(
                                'Equals',
                                new ObjectAccessorNode('x.totalSegments'),
                                new NumberValueNode(12)
                            )
                        )
                    )
                )
            )));
    const resultJson = JSON.stringify(lambda);
    const expectJson = JSON.stringify(expectedTree);
    assert(expectJson === resultJson);
});

test("Must parse simple inverse group node", () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = PredicateExpressionParser.Instance;

    const predicate: (value: ClockRecord) => boolean = x => !x.brand.startsWith(x.clockModel) || x.clockType === "Analog";
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const actualJson = JSON.stringify(lambda);
});
