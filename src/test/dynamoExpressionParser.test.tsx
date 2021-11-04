import {ClockRecord} from "./models";
import DynamoDBExpressionParser from "../parser/dynamoExpressionParser";
import {LambdaExpressionLexer} from "../lexer/lambdaExpressionLexer";
import assert from "assert";
import {
    BooleanOperationNode,
    CompareOperationNode, FunctionNode, GroupNode, InverseNode,
    LambdaExpressionNode, NumberValueNode,
    ObjectAccessorNode,
    StringValueNode
} from "../parser/nodes";


test('Must parse a non-lambda expression', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
    const predicateString = "brand && brand.startsWith(\"Fos\") || !!brand";
    const tokens = lexer.tokenize(predicateString);
    const expression = parser.parse(predicateString, tokens);
    const expected = new BooleanOperationNode(
        'Or',
        new BooleanOperationNode(
            'And',
            new ObjectAccessorNode('brand'),
            new FunctionNode('startsWith', new ObjectAccessorNode('brand'), new StringValueNode('"Fos"', false))
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

test('Must build AST tree for grouped expression with a function', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
    const predicate: (value: ClockRecord) => boolean = x => (x.brand.startsWith("Fos") || x.brand.length === 1) || x.clockType === 'Analog' && !!x.brand;
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
                    new FunctionNode(
                        'startsWith',
                        new ObjectAccessorNode('x.brand'),
                        new StringValueNode(`"Fos"`, false)
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
                    new StringValueNode(`'Analog'`, false)
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

test('Must build AST tree for ungrouped AND and OR expression', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
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
                    new StringValueNode(`'Fossil'`, false)
                ),
                new CompareOperationNode(
                    'Equals',
                    new ObjectAccessorNode('x.totalSegments'),
                    new NumberValueNode(24))
            ),
            new CompareOperationNode(
                'Equals',
                new ObjectAccessorNode('x.clockType'),
                new StringValueNode(`'Analog'`, false)
            )
            ));

    const actual = JSON.stringify(lambda);
    const expect = JSON.stringify(expectedLambda);
    assert(expect === actual);
});

test('Must build AST tree for ungrouped OR and AND expression', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
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
                new StringValueNode(`'Fossil'`, false)
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
                    new StringValueNode(`'Analog'`, false)
                )
            )
        )
    )

    const actual = JSON.stringify(lambda);
    const expect = JSON.stringify(expectedExpr);
    assert(expect === actual);
});

test('Must build AST tree for multiple group expressions', () =>{
    const lexer = new LambdaExpressionLexer();
    const parser = new DynamoDBExpressionParser();
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
            new CompareOperationNode('Equals', new ObjectAccessorNode('x.brand'), new StringValueNode(`'Fossil'`, false)),
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
                                new StringValueNode(`'Analog'`, false)
                            )
                        )
                    ),
                    new GroupNode(
                        new BooleanOperationNode(
                            'Or',
                            new CompareOperationNode(
                                'Equals',
                                new ObjectAccessorNode('x.clockType'),
                                new StringValueNode(`'Unknown'`, false)
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
