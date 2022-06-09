import {AppRecordIdBase, PartitionAttributeValue, RangeAttributeValue} from "./appRecordIdBase";
import {ArrowStoreRecordCtor, ArrowStoreRecordId, ArrowStoreTypeRecord, PrimaryAttributeValue} from "arrow-store";

export const UserRecordType = "UserRecord";

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

    getRecordTypeId(): string {
        return UserRecordType;
    }

    isConsistentRead(): boolean {
        return false;
    }

    getCtor(): ArrowStoreRecordCtor<UserRecord> | undefined {
        return undefined;
    }

    getIndexName(): string | undefined {
        return undefined;
    }
}

export class UserRecord implements ArrowStoreTypeRecord<UserRecordId> {
    constructor() {
        this.userId = "";
        this.isActive = false;
    }

    userId: string;
    isActive: boolean;
    expiresIn: number | undefined;

    getRecordId(): ArrowStoreRecordId {
        return new UserRecordId(this.userId);
    }
}