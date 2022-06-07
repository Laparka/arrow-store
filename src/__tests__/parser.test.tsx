import WhereCauseExpressionParser from "../parser/whereCauseExpressionParser";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import assert from "assert";
import {
    BooleanExpressionNode,
    CompareExpressionNode,
    FunctionExpressionNode,
    GroupExpressionNode,
    InverseExpressionNode,
    LambdaExpressionNode,
    ObjectAccessorNode,
    ConstantValueNode
} from "../parser/nodes";
import {ClockRecord} from "./models";

test('Must understand inverse', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = WhereCauseExpressionParser.Instance;
    const predicateString = "x => x.brand.startsWith(\"Fos\") || !Object.hasOwnProperty(x.brand)";
    const tokens = lexer.tokenize(predicateString);
    const expression = parser.parse(predicateString, tokens);
})
test('Must parse a non-lambda expression', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = WhereCauseExpressionParser.Instance;
    const predicateString = "brand && brand.startsWith(\"Fos\") || !!brand";
    const tokens = lexer.tokenize(predicateString);
    const expression = parser.parse(predicateString, tokens);
    const expected = new BooleanExpressionNode(
        'OR',
        new BooleanExpressionNode(
            'AND',
            new ObjectAccessorNode('brand'),
            new FunctionExpressionNode('startsWith', new ObjectAccessorNode('brand'), new ConstantValueNode('Fos'))
        ),
        new InverseExpressionNode(
            new InverseExpressionNode(
                new ObjectAccessorNode('brand')
            )
        ));
    const expect = JSON.stringify(expected);
    const actual = JSON.stringify(expression);
    assert(expect === actual);
});

test('Must build AST tree for grouped expression with a function', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = WhereCauseExpressionParser.Instance;
    const predicate: (value: ClockRecord) => boolean = x => (x.brand && x.brand.startsWith("Fos") || x.brand.length === 1) || x.clockType === 'Analog' && !!x.brand;
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const expectedLambda = new LambdaExpressionNode(
        new ObjectAccessorNode('x'),
        new BooleanExpressionNode(
            'OR',
            new GroupExpressionNode(
                new BooleanExpressionNode(
                    'OR',
                    new BooleanExpressionNode(
                        'AND',
                        new ObjectAccessorNode('x.brand'),
                        new FunctionExpressionNode(
                            'startsWith',
                            new ObjectAccessorNode('x.brand'),
                            new ConstantValueNode(`Fos`)
                        ),
                    ),
                    new CompareExpressionNode(
                        'Equals',
                        new ObjectAccessorNode('x.brand.length'),
                        new ConstantValueNode('1')
                    )
                )
            ), // x.clockType === 'Analog' && !!x.brand
            new BooleanExpressionNode(
                'AND',
                new CompareExpressionNode(
                    'Equals',
                    new ObjectAccessorNode('x.clockType'),
                    new ConstantValueNode(`Analog`)
                ),
                new InverseExpressionNode(
                    new InverseExpressionNode(
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
    const parser = WhereCauseExpressionParser.Instance;
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' && x.totalSegments === 24 || x.clockType === 'Analog';
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const expectedLambda = new LambdaExpressionNode(
        new ObjectAccessorNode('x'),
        new BooleanExpressionNode(
            'OR',
            new BooleanExpressionNode(
                'AND',
                new CompareExpressionNode(
                    'Equals',
                    new ObjectAccessorNode('x.brand'),
                    new ConstantValueNode(`Fossil`)
                ),
                new CompareExpressionNode(
                    'Equals',
                    new ObjectAccessorNode('x.totalSegments'),
                    new ConstantValueNode('24'))
            ),
            new CompareExpressionNode(
                'Equals',
                new ObjectAccessorNode('x.clockType'),
                new ConstantValueNode(`Analog`)
            )
        ));

    const actual = JSON.stringify(lambda);
    const expect = JSON.stringify(expectedLambda);
    assert(expect === actual);
});

test('Must build AST tree for ungrouped OR and AND expression', () => {
    const lexer = LambdaPredicateLexer.Instance;
    const parser = WhereCauseExpressionParser.Instance;
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' || x.totalSegments === 24 && x.clockType === 'Analog';
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const expectedExpr = new LambdaExpressionNode(
        new ObjectAccessorNode('x'),
        new BooleanExpressionNode(
            'OR',
            new CompareExpressionNode(
                'Equals',
                new ObjectAccessorNode('x.brand'),
                new ConstantValueNode(`Fossil`)
            ),
            new BooleanExpressionNode(
                'AND',
                new CompareExpressionNode(
                    'Equals',
                    new ObjectAccessorNode('x.totalSegments'),
                    new ConstantValueNode('24')
                ),
                new CompareExpressionNode(
                    'Equals',
                    new ObjectAccessorNode('x.clockType'),
                    new ConstantValueNode(`Analog`)
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
    const parser = WhereCauseExpressionParser.Instance;
    const predicate: (value: ClockRecord) => boolean = x => x.brand === 'Fossil' ||
        (
            (x.totalSegments === 24 || x.clockType === 'Analog') && (x.clockType === 'Unknown' || x.totalSegments === 12)
        );
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const expectedTree = new LambdaExpressionNode(
        new ObjectAccessorNode("x"),
        new BooleanExpressionNode('OR',
            new CompareExpressionNode('Equals', new ObjectAccessorNode('x.brand'), new ConstantValueNode(`Fossil`)),
            new GroupExpressionNode(
                new BooleanExpressionNode('AND',
                    new GroupExpressionNode(
                        new BooleanExpressionNode(
                            'OR',
                            new CompareExpressionNode(
                                'Equals',
                                new ObjectAccessorNode('x.totalSegments'),
                                new ConstantValueNode('24')
                            ),
                            new CompareExpressionNode(
                                'Equals',
                                new ObjectAccessorNode('x.clockType'),
                                new ConstantValueNode(`Analog`)
                            )
                        )
                    ),
                    new GroupExpressionNode(
                        new BooleanExpressionNode(
                            'OR',
                            new CompareExpressionNode(
                                'Equals',
                                new ObjectAccessorNode('x.clockType'),
                                new ConstantValueNode(`Unknown`)
                            ),
                            new CompareExpressionNode(
                                'Equals',
                                new ObjectAccessorNode('x.totalSegments'),
                                new ConstantValueNode('12')
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
    const parser = WhereCauseExpressionParser.Instance;

    const predicate: (value: ClockRecord) => boolean = x => !x.brand.startsWith(x.clockModel) || x.clockType === "Analog";
    const predicateString = predicate.toString();
    const tokens = lexer.tokenize(predicateString);
    const lambda = parser.parse(predicateString, tokens);
    const actualJson = JSON.stringify(lambda);
});
