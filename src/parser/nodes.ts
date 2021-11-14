import {COMPARE_OPERATOR_TYPE} from "../records/record";

export type BOOLEAN_OPERATOR = 'And' | 'Or';
export type PROPERTY_TYPE = "StringValue" | "NumberValue" | "BooleanValue" | "NullValue" | "UndefinedValue"
export type EXPRESSION_NODE_TYPE = PROPERTY_TYPE | "LambdaExpression" | "GroupExpression" | "Function" | "Inverse"
    | "ObjectAccessor" | "BooleanOperation" | "CompareOperation" | "Arguments";

export abstract class ParserNode {
    abstract get nodeType(): EXPRESSION_NODE_TYPE;
}

export class ObjectAccessorNode extends ParserNode {
    private readonly _value: string;

    constructor(value: string) {
        super();
        this._value = value;
    }

    get value(): string {
        return this._value;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "ObjectAccessor";
    }
}

export class FunctionNode extends ParserNode {
    private readonly _functionName: string;
    private readonly _instance: ObjectAccessorNode;
    private readonly _args: ParserNode;

    constructor(functionName: string, instance: ObjectAccessorNode, args: ParserNode) {
        super();
        this._functionName = functionName;
        this._instance = instance;
        this._args = args;
    }

    get functionName(): string {
        return this._functionName;
    }

    get instance(): ObjectAccessorNode {
        return this._instance;
    }

    get args(): ParserNode[] {
        if (this._args.nodeType === "Arguments") {
            return (<ArgumentsNode>this._args).args;
        }

        return [this._args];
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Function";
    }
}

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

    get operator(): BOOLEAN_OPERATOR {
        return this._booleanOperator;
    }

    get left(): ParserNode {
        return this._leftOperand;
    }

    get right(): ParserNode {
        return this._rightOperand;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "BooleanOperation";
    }
}

export class CompareOperationNode extends ParserNode {
    private readonly _comparisonOperator: COMPARE_OPERATOR_TYPE;
    private readonly _leftOperand: ParserNode;
    private readonly _rightOperand: ParserNode;

    constructor(comparisonOperator: COMPARE_OPERATOR_TYPE, left: ParserNode, right: ParserNode) {
        super();
        this._leftOperand = left;
        this._rightOperand = right;
        this._comparisonOperator = comparisonOperator;
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

export class StringValueNode extends ObjectAccessorNode {
    private readonly _isEnquote: boolean;

    constructor(value: string, isEnquote: boolean) {
        super(value);
        this._isEnquote = isEnquote;
    }

    get isEnquote(): boolean {
        return this._isEnquote;
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

    get value(): number {
        return this._value;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "NumberValue";
    }
}

export class NullValueNode extends ParserNode {
    get nodeType(): EXPRESSION_NODE_TYPE {
        return "NullValue";
    }
}

export class UndefinedValueNode extends ParserNode {
    get nodeType(): EXPRESSION_NODE_TYPE {
        return "UndefinedValue";
    }
}

export class BoolValueNode extends ParserNode {
    private readonly _value: boolean;

    constructor(value: boolean) {
        super();
        this._value = value;
    }

    get value(): boolean {
        return this._value;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "BooleanValue";
    }
}

export class ArgumentsNode extends ParserNode {
    private readonly _args: ParserNode[];

    constructor(args: ParserNode[]) {
        super();
        this._args = args;
    }

    get args(): ParserNode[] {
        return this._args;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Arguments";
    }
}

export class InverseNode extends ParserNode {
    constructor(body: ParserNode) {
        super();
        this.body = body;
    }

    body: ParserNode;

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

    get body(): ParserNode {
        return this._bodyNode;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "GroupExpression";
    }
}
