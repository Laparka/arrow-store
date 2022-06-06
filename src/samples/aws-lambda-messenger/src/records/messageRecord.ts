import {AppRecordIdBase, PartitionAttributeValue, RangeAttributeValue} from "./appRecordIdBase";
import {Ctor, DynamoDBRecordBase, PrimaryAttributeValue} from "arrow-store";

export const MessageRecordTypeId = Symbol.for("MessageRecord");

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

    getRecordType(): Ctor<MessageRecord> {
        return MessageRecord;
    }

    getRecordTypeId(): symbol {
        return MessageRecordTypeId;
    }

    isConsistentRead(): boolean {
        return false;
    }
}

export class MessageRecord extends DynamoDBRecordBase<MessageRecordId> {
    messageId: string;
    contactId: string;
    message: string;
    viewedBy?: string;
    expiresUtc?: number;
    constructor() {
        super();
        this.message = "";
        this.messageId = "";
        this.contactId = "";
    }

    protected doGetRecordId(): MessageRecordId {
        return new MessageRecordId(this.contactId, this.messageId);
    }
}