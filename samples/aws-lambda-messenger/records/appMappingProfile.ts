import {DynamoDBMappingProfile, MappingBuilder} from "arrow-store";
import {UserRecord, UserRecordType} from "./userRecord";
import {MessageRecord, MessageRecordId, MessageRecordTypeId} from "./messageRecord";

export class AppMappingProfile implements DynamoDBMappingProfile {
    register(builder: MappingBuilder): void {
        builder
            .createReaderFor<UserRecord>(UserRecordType)
            .forMember(x => x.userId, r => r.asString("Id"))
            .forMember(x => x.isActive, r => r.asBool("RECORD_DATA.IS_ACTIVE"));
        builder
            .createWriterFor<UserRecord>(UserRecordType)
            .forMember(x => x.isActive, r => r.asBool("RECORD_DATA.IS_ACTIVE"));

        builder
            .createReaderFor<MessageRecord>(MessageRecordTypeId)
            .forMember(x => x.message, r => r.asString("RECORD_DATA.MESSAGE"))
            .forMember(x => x.messageId, r => r.asString("Id"))
            .forMember(x => x.viewedBy, r => r.asString("RECORD_DATA.VIEWED_BY"))
            .forMember(x => x.contactId, r => r.asString("RECORD_DATA.RECEIVING_USERID"))
            .forMember(x => x.expiresUtc, r => r.asNumber("EXPIRES"));

        builder
            .createWriterFor<MessageRecord>(MessageRecordTypeId)
            .forMember(x => x.message, r => r.asString("RECORD_DATA.MESSAGE"))
            .forMember(x => x.viewedBy, r => r.asString("RECORD_DATA.VIEWED_BY"))
            .forMember(x => x.contactId, r => r.asString("RECORD_DATA.RECEIVING_USERID"))
            .forMember(x => x.expiresUtc, r => r.asNumber("EXPIRES"));
    }

}