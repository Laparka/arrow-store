import {
    COMPARE_OPERATOR_TYPE, Ctor,
    DynamoDBRecordBase,
    DynamoDBAttributeQuery,
    DynamoDBRecordIndexBase, FUNCTION_OPERATOR_TYPE
} from "../records/record";
import {DYNAMODB_ATTRIBUTE_TYPE} from "../mappers/schemaBuilders";

export const RECORD_TYPES = {
    ClockRecord: Symbol.for("ClockRecord")
};
export class ClockRecordId extends DynamoDBRecordIndexBase<ClockRecord> {
    private readonly _clockId: string;
    constructor(clockId: string) {
        super();
        this._clockId = clockId;
    }

    getPrimaryKeys(): ReadonlyArray<DynamoDBAttributeQuery> {
        return [new PartitionKey('ClockRecord'), new RangeKey(this._clockId)];
    }

    getRecordTypeId(): symbol {
        return RECORD_TYPES.ClockRecord;
    }

    protected getRecordType(): Ctor<ClockRecord> {
        return ClockRecord;
    }

    indexName(): string | undefined {
        return undefined;
    }

    isConsistentRead(): boolean {
        return false;
    }

    tableName(): string {
        return "unit_test_table";
    }

}

export type CLOCK_TYPE = 'Unknown' |  'Digital' | 'Analog' | 'Hybrid';

export type ClockDetails = {
    madeIn: string;
    serialNumber: string;
};
export class ClockRecord extends DynamoDBRecordBase<ClockRecordId> {
    constructor() {
        super();
        this.isCertified = false;
        this.totalSegments = null;
        this.clockDetails = null;
    };

    isCertified: boolean;
    clockType!: CLOCK_TYPE;
    totalSegments: number | null;
    brand!: string;
    clockModel!: string;
    clockDetails: ClockDetails | null;
    protected doGetRecordId(): ClockRecordId {
        if (!this.clockModel) {
            throw Error(`The clockModel value is missing`)
        }

        return new ClockRecordId(this.clockModel);
    }
}

export class ClocksQuery extends DynamoDBRecordIndexBase<ClockRecord> {
    getPrimaryKeys(): ReadonlyArray<DynamoDBAttributeQuery> {
        return [new PartitionKey('ClockRecord')];
    }

    getRecordTypeId(): symbol {
        return RECORD_TYPES.ClockRecord;
    }

    protected getRecordType(): Ctor<ClockRecord> {
        return ClockRecord;
    }

    isConsistentRead(): boolean {
        return false;
    }

    tableName(): string {
        return "unit_test_table";
    }

}

export class PartitionKey implements DynamoDBAttributeQuery {
    constructor(partitionValue: string) {
        this.attributeName = 'Namespace';
        this.attributeValue = partitionValue;
        this.attributeType = "S";
    }

    attributeName: string;
    attributeValue: string;
    attributeType: DYNAMODB_ATTRIBUTE_TYPE;

    get operator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return "Equals";
    }
}

export class RangeKey implements DynamoDBAttributeQuery {
    private readonly _comparisonOperator: COMPARE_OPERATOR_TYPE;
    constructor(sortValue: string, operator: COMPARE_OPERATOR_TYPE = 'Equals') {
        this.attributeName = 'Id';
        this.attributeValue = sortValue;
        this.attributeType = "S";
        this._comparisonOperator = operator;
    }

    attributeName: string;
    attributeValue: string;
    attributeType: DYNAMODB_ATTRIBUTE_TYPE;

    get operator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return this._comparisonOperator;
    }
}
