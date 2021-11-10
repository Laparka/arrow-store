import {
    COMPARE_OPERATOR_TYPE, Ctor,
    DynamoDBRecordBase,
    DynamoDBPrimaryKey,
    DynamoDBQueryIndexBase
} from "../records/record";

export const RECORD_TYPES = {
    ClockRecord: Symbol.for("ClockRecord")
};
export class ClockRecordId extends DynamoDBQueryIndexBase<ClockRecord> {
    private readonly _clockId: string;
    constructor(clockId: string) {
        super();
        this._clockId = clockId;
    }

    getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryKey> {
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

export type CLOCK_TYPE = 'Unknown' |  'Digital' | 'Analog';

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

export class ClocksQuery extends DynamoDBQueryIndexBase<ClockRecord> {
    getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryKey> {
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
        return "unit_test";
    }

}

export class PartitionKey implements DynamoDBPrimaryKey {
    constructor(partitionValue: string) {
        this.attributeName = 'Namespace';
        this.attributeValue = partitionValue;
    }

    attributeName: string;
    attributeValue: string;

    get operator(): COMPARE_OPERATOR_TYPE {
        return "Equals";
    }
}

export class RangeKey implements DynamoDBPrimaryKey {
    private readonly _comparisonOperator: COMPARE_OPERATOR_TYPE;
    constructor(sortValue: string, operator: COMPARE_OPERATOR_TYPE = 'Equals') {
        this.attributeName = 'RecordId';
        this.attributeValue = sortValue;
        this._comparisonOperator = operator;
    }

    attributeName: string;
    attributeValue: string;

    get operator(): COMPARE_OPERATOR_TYPE {
        return this._comparisonOperator;
    }
}
