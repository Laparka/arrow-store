import {DynamoDBMemberSchemaBuilder, DynamoDBRecordSchemaBuilder} from "./schemaBuilders";

export default class DynamoDBMemberBuilder<TMember> implements DynamoDBMemberSchemaBuilder<TMember> {
    private readonly _memberName: string;

    constructor(memberName: string) {
        this._memberName = memberName;
    }

    asBool(attributeName: string): DynamoDBMemberSchemaBuilder<TMember> {
        return this;
    }

    asNumber(attributeName: string): DynamoDBMemberSchemaBuilder<TMember> {
        return this;
    }

    asObject(nestedAttributeName: string, map: (attribute: DynamoDBRecordSchemaBuilder<TMember>) => DynamoDBRecordSchemaBuilder<TMember>): DynamoDBMemberSchemaBuilder<TMember> {
        return this;
    }

    asString(attributeName: string): DynamoDBMemberSchemaBuilder<TMember> {
        return this;
    }

    nestedIn(nestedAttributeName: string): DynamoDBMemberSchemaBuilder<TMember> {
        return this;
    }
}
