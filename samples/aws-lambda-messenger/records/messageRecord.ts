import {AppRecordIdBase, PartitionAttributeValue, RangeAttributeValue} from "./appRecordIdBase";
import {ArrowStoreRecordCtor, ArrowStoreRecordId, ArrowStoreTypeRecord, PrimaryAttributeValue} from "arrow-store";

export const MessageRecordTypeId ="MessageRecord";

export class MessageRecordId extends AppRecordIdBase<MessageRecord> {
    private readonly _contactId: string;
    private readonly _messageId: string;

    constructor(contactId: string, messageId: string) {
        super();
        this._contactId = contactId;
        this._messageId = messageId;
    }

    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        if (!this._contactId) {
            throw Error(`The contact ID is missing`);
        }

        if (!this._messageId) {
            throw Error(`The message ID is missing`);
        }

        return [
            new PartitionAttributeValue(`MessageRecord#${this._contactId}`),
            new RangeAttributeValue(this._messageId)
        ];
    }

    getCtor(): ArrowStoreRecordCtor<MessageRecord> {
        return MessageRecord;
    }

    getRecordTypeId(): string {
        return MessageRecordTypeId;
    }

    isConsistentRead(): boolean {
        return false;
    }

    getIndexName(): string | undefined {
        return undefined;
    }
}

export class MessageRecord implements ArrowStoreTypeRecord<MessageRecordId> {
    messageId: string;
    contactId: string;
    message: string;
    viewedBy?: string;
    expiresUtc?: number;
    constructor() {
        this.message = "";
        this.messageId = "";
        this.contactId = "";
    }

    getRecordId(): ArrowStoreRecordId {
        return new MessageRecordId(this.contactId, this.messageId);
    }
}

export class UserMessagesQuery extends AppRecordIdBase<MessageRecord> {
    private readonly _userId: string;
    constructor(userId: string) {
        super();
        this._userId = userId;
    }

    getCtor(): ArrowStoreRecordCtor<MessageRecord> | undefined {
        return MessageRecord;
    }

    getIndexName(): string | undefined {
        return undefined;
    }

    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        return [new PartitionAttributeValue(`MessageRecord#${this._userId}`)];
    }

    getRecordTypeId(): string {
        return MessageRecordTypeId;
    }

    isConsistentRead(): boolean {
        return false;
    }
}