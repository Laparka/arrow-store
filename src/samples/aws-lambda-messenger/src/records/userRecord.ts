import {Ctor, DynamoDBRecordBase, DynamoDBRecordIndexBase, PrimaryAttributeValue} from "arrow-store";
import {AppRecordIdBase, PartitionAttributeValue, RangeAttributeValue} from "./appRecordIdBase";

export const UserRecordType = Symbol.for("UserRecord");

export class UserRecordId extends AppRecordIdBase<UserRecord> {
    private readonly _userId: string;
    constructor(userId: string) {
        super();
        this._userId = userId;
    }

    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        return [
            new PartitionAttributeValue("UserRecord"),
            new RangeAttributeValue(this._userId)
        ];
    }

    getRecordType(): Ctor<UserRecord> {
        return UserRecord;
    }

    getRecordTypeId(): symbol {
        return UserRecordType;
    }

    isConsistentRead(): boolean {
        return false;
    }
}

export class UserRecord extends DynamoDBRecordBase<UserRecordId> {
    constructor() {
        super();
        this.userId = "";
        this.isActive = false;
    }

    userId: string;
    isActive: boolean;

    protected doGetRecordId(): UserRecordId {
        return new UserRecordId(this.userId);
    }
}