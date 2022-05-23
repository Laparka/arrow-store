import {
    AttributeValue,
    ExpressionAttributeNameMap,
    ExpressionAttributeValueMap, Key,
    QueryInput
} from "aws-sdk/clients/dynamodb";
import {
    COMPARE_OPERATOR_TYPE,
    DynamoDBRecordIndex,
    FUNCTION_OPERATOR_TYPE,
    PrimaryAttributeValue
} from "../records/record";
import {ClockRecordId} from "../test/models";
import {DYNAMODB_ATTRIBUTE_TYPE} from "../mappers/schemaBuilders";

export type RequestInput = {
    ExpressionAttributeNames?: ExpressionAttributeNameMap;
    ExpressionAttributeValues?: ExpressionAttributeValueMap;
}

export abstract class AttributesBuilderBase {
    protected joinFilterExpressions(expressions: string[]): string | undefined {
        if (expressions && expressions.length !== 0) {
            if (expressions.length === 1) {
                return expressions[0];
            }

            return expressions.map(x => `(${x})`).join(' AND ');
        }

        return undefined;
    }

    protected setExpressionAttributes(attributeNames: Map<string, string>, attributeValues: Map<string, AttributeValue>, input: RequestInput): void {
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

    protected toQueryKeyExpression(primaryKeys: ReadonlyArray<PrimaryAttributeValue>, input: RequestInput): string {
        const expressions: string[] = [];
        for (let i = 0; i < primaryKeys.length; i++) {
            expressions.push(AttributesBuilderBase._toKeyAttributeExpression(primaryKeys[i], input));
        }

        return expressions.join(' AND ');
    }

    private static _toKeyAttributeExpression(attributeValue: PrimaryAttributeValue, input: RequestInput): string {
        const attribute: AttributeValue = {};
        attribute[attributeValue.getAttributeType().toString()] = attributeValue.getAttributeValue();
        const key = `:${attributeValue.getPrimaryKeyType().toLowerCase()}`;
        if (!input.ExpressionAttributeValues) {
            input.ExpressionAttributeValues = {};
        }

        input.ExpressionAttributeValues[key] = attribute;
        if (!input.ExpressionAttributeNames) {
            input.ExpressionAttributeNames = {};
        }

        const attributeName = `#partition_key_${Object.getOwnPropertyNames(input.ExpressionAttributeNames).length}`;
        input.ExpressionAttributeNames[attributeName] = attributeValue.getAttributeName();
        return this._toDynamoDBCompare(attributeName, key, attributeValue.getCompareOperator());
    }

    private static _toDynamoDBCompare(attributeName: string, value: string, compareOperator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE): string {
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
}