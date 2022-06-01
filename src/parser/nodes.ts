import {COMPARE_OPERATOR_TYPE} from "../records/record";

export type BOOLEAN_OPERATOR = 'AND' | 'OR';
export type EXPRESSION_NODE_TYPE = "ConstantValue" | "NullValue" | "UndefinedValue" | "LambdaExpression" | "GroupExpression" | "Function" | "Inverse"
    | "ObjectAccessor" | "BooleanOperation" | "CompareOperation" | "Arguments" | "Size"
    | "Assign" | "MathOperation" | "Increment" | "AttributeExists" | "AttributeNotExists"  | "SetWhenNotExists";

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

export class FunctionExpressionNode extends ParserNode {
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
            return (<ArgumentsExpressionNode>this._args).args;
        }

        return [this._args];
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Function";
    }
}

export class BooleanExpressionNode extends ParserNode {
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

export class CompareExpressionNode extends ParserNode {
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

export class AssignExpressionNode extends ParserNode {
    private readonly _member: ParserNode;
    private readonly _value: ParserNode;
    constructor(member: ParserNode, value: ParserNode) {
        super();
        this._member = member;
        this._value = value;
    }

    get member(): ObjectAccessorNode {
        if (this._member.nodeType !== "ObjectAccessor") {
            throw Error(`The left expression must be an object accessor`);
        }

        return <ObjectAccessorNode>this._member;
    }

    get value(): ParserNode {
        return this._value;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Assign";
    }
}

export class IncrementExpressionNode extends ParserNode {
    private readonly _target: ParserNode;
    private readonly _incrementValue: ParserNode;
    constructor(target: ParserNode, incrementValue: ParserNode) {
        super();
        this._target = target;
        this._incrementValue = incrementValue;
    }

    get member(): ParserNode {
        return this._target;
    }

    get incrementValue(): ParserNode {
        return this._incrementValue;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Increment";
    }

}
export class MathExpressionNode extends ParserNode {
    private readonly _left: ParserNode;
    private readonly _right: ParserNode;
    private readonly _operator: string;
    constructor(left: ParserNode, right: ParserNode, operator: string) {
        super();
        this._left = left;
        this._right = right;
        this._operator = operator;
    }

    get left(): ParserNode {
        return this._left;
    }

    get right(): ParserNode {
        return this._right;
    }

    get operator(): string {
        return this._operator;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "MathOperation";
    }
}

export class ArgumentsExpressionNode extends ParserNode {
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

export class InverseExpressionNode extends ParserNode {
    constructor(body: ParserNode) {
        super();
        this.body = body;
    }

    body: ParserNode;

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Inverse";
    }
}

export class GroupExpressionNode extends ParserNode {
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

export class ConstantValueNode extends ParserNode {
    private readonly _value: string;
    constructor(value: string) {
        super();
        this._value = value;
    }

    get value(): string {
        return this._value;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "ConstantValue";
    }
}

export class AttributeExistsNode extends ParserNode {
    private readonly _attribute: ObjectAccessorNode;
    constructor(accessorExpression: ObjectAccessorNode) {
        super();
        this._attribute = accessorExpression;
    }

    get attribute(): ObjectAccessorNode {
        return this._attribute;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "AttributeExists";
    }
}

export class AttributeNotExistsNode extends ParserNode {
    private readonly _attribute: ObjectAccessorNode;
    constructor(accessorExpression: ObjectAccessorNode) {
        super();
        this._attribute = accessorExpression;
    }

    get attribute(): ObjectAccessorNode {
        return this._attribute;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "AttributeNotExists";
    }
}

export class SizeExpressionNode extends ParserNode {
    private readonly _instanceAccessor: ObjectAccessorNode;
    constructor(instanceAccessor: ObjectAccessorNode) {
        super();
        this._instanceAccessor = instanceAccessor;
    }

    get instanceAccessor(): ObjectAccessorNode {
        return this._instanceAccessor;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "Size";
    }
}

export class SetWhenNotExistsExpression extends ParserNode {
    private readonly _memberExistExpr: ParserNode;
    private readonly _updateExpr: ParserNode;

    constructor(memberExistExpr: ParserNode, updateExpr: ParserNode) {
        super();
        this._memberExistExpr = memberExistExpr;
        this._updateExpr = updateExpr;
    }

    get conditionExpression(): ParserNode {
        return this._memberExistExpr;
    }

    get updateExpression(): ParserNode {
        return this._updateExpr;
    }

    get nodeType(): EXPRESSION_NODE_TYPE {
        return "SetWhenNotExists";
    }
}