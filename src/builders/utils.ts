import {
    AttributeValue,
    ExpressionAttributeNameMap,
    ExpressionAttributeValueMap
} from "aws-sdk/clients/dynamodb";
import {
    COMPARE_OPERATOR_TYPE,
    FUNCTION_OPERATOR_TYPE,
    PrimaryAttributeValue
} from "../records/record";

export type RequestInput = {
    ExpressionAttributeNames?: ExpressionAttributeNameMap;
    ExpressionAttributeValues?: ExpressionAttributeValueMap;
}
export function setExpressionAttributes(attributeNames: Map<string, string>, attributeValues: Map<string, AttributeValue>, input: RequestInput): void {
    if (attributeNames.size !== 0) {
        input.ExpressionAttributeNames = {};
        const iterator = attributeNames.keys();
        let attributeName = iterator.next();
        while(!attributeName.done) {
            input.ExpressionAttributeNames[attributeNames.get(attributeName.value)!] = attributeName.value;
            attributeName = iterator.next();
        }
    }

    if (attributeValues.size !== 0) {
        input.ExpressionAttributeValues = {};
        const iterator = attributeValues.keys();
        let attributeValueRef = iterator.next();
        while(!attributeValueRef.done) {
            input.ExpressionAttributeValues[attributeValueRef.value] = attributeValues.get(attributeValueRef.value)!;
            attributeValueRef = iterator.next();
        }
    }
}

export function toKeyAttributeExpression(attributeValue: PrimaryAttributeValue, input: RequestInput): string {
    const attribute: AttributeValue = {};
    attribute[attributeValue.getAttributeType().toString()] = attributeValue.getAttributeValue();
    const attributeValueRef = `:${attributeValue.getPrimaryKeyType().toLowerCase()}`;
    if (!input.ExpressionAttributeValues) {
        input.ExpressionAttributeValues = {};
    }

    input.ExpressionAttributeValues[attributeValueRef] = attribute;
    if (!input.ExpressionAttributeNames) {
        input.ExpressionAttributeNames = {};
    }

    const attributeName = `#partition_key_${Object.getOwnPropertyNames(input.ExpressionAttributeNames).length}`;
    input.ExpressionAttributeNames[attributeName] = attributeValue.getAttributeName();
    return toDynamoDBCompare(attributeName, attributeValueRef, attributeValue.getCompareOperator());
}

export function joinFilterExpressions(expressions: string[]): string | undefined {
    if (expressions && expressions.length !== 0) {
        if (expressions.length === 1) {
            return expressions[0];
        }

        return expressions.map(x => `(${x})`).join(' AND ');
    }

    return undefined;
}

function toDynamoDBCompare(attributeName: string, value: string, compareOperator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE): string {
    let operator: string;
    switch (compareOperator) {
        case "LessThanOrEquals": {
            operator = "<=";
            break;
        }
        case "LessThan": {
            operator = "<";
            break;
        }
        case "GreaterThan": {
            operator = ">";
            break;
        }
        case "GreaterThanOrEquals": {
            operator = ">=";
            break;
        }
        case "Equals": {
            operator = "=";
            break;
        }
        case "NotEquals": {
            operator = "!=";
            break;
        }

        case "BeginsWith": {
            return `begins_with(${attributeName}, ${value})`;
        }
        case "Contains": {
            return `contains(${attributeName}, ${value})`;
        }
        default: {
            throw Error(`Not supported operator ${compareOperator}`);
        }
    }

    return `${attributeName} ${operator} ${value}`;
}