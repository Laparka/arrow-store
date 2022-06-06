import {
    COMPARE_OPERATOR_TYPE,
    Ctor,
    DYNAMODB_ATTRIBUTE_TYPE,
    DynamoDBRecord,
    DynamoDBRecordIndexBase, FUNCTION_OPERATOR_TYPE, PRIMARY_ATTRIBUTE_TYPE,
    PrimaryAttributeValue
} from "arrow-store";

export class PartitionAttributeValue implements PrimaryAttributeValue {
    private readonly _attributeValue: string;
    constructor(attributeValue: string) {
        this._attributeValue = attributeValue;
    }

    getAttributeName(): string {
        return "Namespace";
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }

    getAttributeValue(): string {
        return this._attributeValue;
    }

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return "Equals";
    }

    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Partition";
    }
}

export class RangeAttributeValue implements PrimaryAttributeValue {
    private readonly _attributeValue: string;
    constructor(attributeValue: string) {
        this._attributeValue = attributeValue;
    }

    getAttributeName(): string {
        return "Id";
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }

    getAttributeValue(): string {
        return this._attributeValue;
    }

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return "Equals";
    }

    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Range";
    }
}

export abstract class AppRecordIdBase<TRecord extends DynamoDBRecord> extends DynamoDBRecordIndexBase<TRecord> {
    abstract getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue>;

    abstract getRecordType(): Ctor<TRecord>;

    abstract getRecordTypeId(): symbol;

    abstract isConsistentRead(): boolean;

    getTableName(): string {
        const tableName = process.env["APP_TABLE"];
        if (!tableName) {
            throw Error(`The APP_TABLE Environment variable is not provided for the Lambda Function configuration`);
        }

        return tableName;
    }
}