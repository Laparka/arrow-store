import {COMPARE_OPERATOR_TYPE} from "../records/record";
import {TokenType} from "../lexer/queryTokens";

export type EXPRESSION_NODE_TYPE = "RootParameter" | "LambdaExpression" | "GroupExpression" | "Function" | "Inverse"
    |"ObjectAccessor" | "BooleanOperation" | "CompareOperation"
    | "StringValue" | "NumberValue" | "BooleanValue" | "NullValue";

export abstract class ParserNode {
    abstract get nodeType(): EXPRESSION_NODE_TYPE;
}

export class ObjectAccessorNode extends ParserNode {
    private readonly _propertyAccessor: string;
    constructor(value: string) {
        super();
        this._propertyAccessor = value;
    }

    get accessor(): string {
        return this._propertyAccessor;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "ObjectAccessor";
    }
}

export class FunctionNode extends ParserNode{
    private readonly _functionName: string;
    private readonly _instance: ObjectAccessorNode;
    private readonly _argument: ParserNode | null;
    constructor(functionName: string, instance: ObjectAccessorNode, arg: ParserNode | null) {
        super();
        this._functionName = functionName;
        this._instance = instance;
        this._argument = arg;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Function";
    }
}

export type BOOLEAN_OPERATOR = 'And' | 'Or';

export class BooleanOperationNode extends ParserNode {
    private readonly _booleanOperator: BOOLEAN_OPERATOR;
    private readonly _leftOperand: ParserNode;
    private readonly _rightOperand: ParserNode;
    constructor(operator: BOOLEAN_OPERATOR, left: ParserNode, right: ParserNode) {
        super();
        this._booleanOperator = operator;
        this._leftOperand = left;
        this._rightOperand = right;
    }

    get left(): ParserNode {
        return this._leftOperand;
    }

    get right(): ParserNode {
        return this._rightOperand;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "BooleanOperation";;
    }
}
export class CompareOperationNode extends ParserNode {
    private readonly _comparisonOperator: COMPARE_OPERATOR_TYPE;
    private readonly _leftOperand: ParserNode;
    private readonly _rightOperand: ParserNode;

    constructor(comparisonOperator: TokenType, left: ParserNode, right: ParserNode) {
        super();
        this._leftOperand = left;
        this._rightOperand  = right;
        switch (comparisonOperator) {
            case 'Equals': {
                this._comparisonOperator = 'Equals';
                break;
            }
            case 'NotEquals': {
                this._comparisonOperator = 'NotEquals';
                break;
            }
            case 'GreaterThan': {
                this._comparisonOperator = 'GreaterThan';
                break;
            }
            case 'GreaterOrEquals': {
                this._comparisonOperator = 'GreaterThanOrEquals';
                break;
            }
            case 'LessThanOrEquals': {
                this._comparisonOperator = 'LessThanOrEquals';
                break;
            }
            case 'LessThan': {
                this._comparisonOperator = 'LessThan';
                break;
            }
            default: {
                throw Error(`Invalid comparison operator ${comparisonOperator}`);
            }
        }
    }

    get operator(): COMPARE_OPERATOR_TYPE {
        return this._comparisonOperator;
    }

    get left(): ParserNode {
        return this._leftOperand;
    }

    get right(): ParserNode {
        return this._rightOperand;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "CompareOperation";
    }
}

export class LambdaExpressionNode extends ParserNode {
    private readonly _parameter: ParserNode;
    private readonly _body: ParserNode;

    constructor(parameter: ParserNode, body: ParserNode) {
        super();
        this._parameter = parameter;
        this._body = body;
    }

    get parameter(): ParserNode {
        return this._parameter;
    }

    get body(): ParserNode {
        return this._body;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "LambdaExpression";
    }
}

export class StringValueNode extends ParserNode {
    private readonly _value: string;
    private readonly _isFormatString: boolean;
    constructor(value: string, isFormatString: boolean) {
        super();
        this._value = value;
        this._isFormatString = isFormatString;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "StringValue";
    }
}

export class NumberValueNode extends ParserNode {
    private readonly _value: number;
    constructor(value: number) {
        super();
        this._value = value;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "NumberValue";
    }
}

export class InverseNode extends ParserNode {
    private readonly _body: ParserNode;
    constructor(body: ParserNode) {
        super();
        this._body = body;
    }

    get body(): ParserNode {
        return this._body;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Inverse";
    }
}
export class GroupNode extends ParserNode {
    private readonly _bodyNode: ParserNode;
    constructor(bodyNode: ParserNode) {
        super();
        this._bodyNode = bodyNode;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "GroupExpression";
    }
}
