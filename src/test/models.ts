import {
    COMPARE_OPERATOR_TYPE, Ctor,
    DynamoDBRecordBase,
    DynamoDBPrimaryAttribute,
    DynamoDBRecordIndexBase, FUNCTION_OPERATOR_TYPE, PRIMARY_ATTRIBUTE_TYPE
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

    getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryAttribute> {
        return [new PartitionKey('ClockRecord'), new RangeKey(this._clockId)];
    }

    getRecordTypeId(): symbol {
        return RECORD_TYPES.ClockRecord;
    }

    protected getRecordType(): Ctor<ClockRecord> {
        return ClockRecord;
    }

    getIndexName(): string | undefined {
        return undefined;
    }

    isConsistentRead(): boolean {
        return false;
    }

    getTableName(): string {
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
    getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryAttribute> {
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

    getTableName(): string {
        return "unit_test_table";
    }

}

export class PartitionKey implements DynamoDBPrimaryAttribute {
    private readonly _value: string;
    constructor(value: string) {
        this._value = value;
    }
    get attributeType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Partition";
    }

    get name(): string {
        return "Namespace";
    }

    get operator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return "Equals";
    }

    get value(): any {
        return this._value;
    }

    get valueType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }
}

export class RangeKey implements DynamoDBPrimaryAttribute {
    private readonly _value: string;
    private readonly _comparisonOperator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE;
    constructor(sortValue: string, operator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE = 'Equals') {
        this._value = sortValue;
        this._comparisonOperator = operator;
    }

    get attributeType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Range";
    }

    get name(): string {
        return "Id";
    }

    get operator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return this._comparisonOperator;
    }

    get value(): any {
        return this._value;
    }

    get valueType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }
}
