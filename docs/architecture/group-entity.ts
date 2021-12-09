import { Entity, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { ObjectType, InputType, Field, Int } from "@nestjs/graphql";
import { Survey, GroupType } from ".";
import { FieldColumn } from 'src/decorators';


@Entity()
@ObjectType({ description: "Group of survey respondents" })
export class Group {
  @Field(() => Int, { description: 'Primary key' })
  @PrimaryGeneratedColumn({ comment: 'Primary key' })
  id: number;

  @FieldColumn("Group name")
  name: string;

  @FieldColumn("Date when survey created")
  created: string;

  @FieldColumn("Date when survey closes")
  closedAfter: string;

  @FieldColumn("Group administrator first name")
  adminFirstName: string;

  @FieldColumn("Group administrator last name")
  adminLastName: string;

  @FieldColumn("Group administrator email address")
  adminEmail: string;

  @FieldColumn("Survey code word used by group")
  codeWord: string;

  @Field(() => Survey)
  @ManyToOne(() => Survey, survey => survey.groups)
  survey: Survey;

  @Field(() => GroupType)
  @ManyToOne(() => GroupType, groupType => groupType.groups)
  groupType: GroupType;
}

@InputType()
export class GroupCreateInput {
  @FieldColumn("Group name")
  name: string;

  @FieldColumn("Date when survey created")
  created: string;

  @FieldColumn("Date when survey closes")
  closedAfter: string;

  @FieldColumn("Group administrator first name")
  adminFirstName: string;

  @FieldColumn("Group administrator last name")
  adminLastName: string;

  @FieldColumn("Group administrator email address")
  adminEmail: string;

  @FieldColumn("Survey code word used by group")
  codeWord: string;
}

@InputType()
export class GroupUpdateInput {
  @Field(() => Int, { description: 'Primary key' })
  id: number;

  @FieldColumn("Group name", { nullable: true })
  name?: string;

  @FieldColumn("Date when survey created", { nullable: true })
  created?: string;

  @FieldColumn("Date when survey closes", { nullable: true })
  closedAfter?: string;

  @FieldColumn("Group administrator first name", { nullable: true })
  adminFirstName?: string;

  @FieldColumn("Group administrator last name", { nullable: true })
  adminLastName?: string;

  @FieldColumn("Group administrator email address", { nullable: true })
  adminEmail?: string;

  @FieldColumn("Survey code word used by group", { nullable: true })
  codeWord?: string;
}

