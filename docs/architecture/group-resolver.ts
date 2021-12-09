import { Args, Mutation, Query, Resolver, Int } from "@nestjs/graphql";

import { GroupService } from "../services";
import {
  Group,
  GroupCreateInput,
  GroupUpdateInput
} from "../models";

@Resolver("Group")
  export class GroupResolver {
  constructor(private readonly Service: GroupService) {}

  @Mutation(() => Group)
    createGroup(@Args("createInput") createInput: GroupCreateInput) {
    return this.Service.create(createInput);
  }

  @Query(() => Group)
    readOneGroup(id: number) {
    return this.Service.readOne(id);
  }

  @Query(() => [Group])
    readAllGroups() {
    return this.Service.readAll();
  }

  @Mutation(() => Group)
    updateGroup(@Args("updateInput") updateInput: GroupUpdateInput) {
    return this.Service.update(updateInput);
  }

  @Mutation(() => Int)
    deleteGroup(@Args({ name: "id", type: () => Int }) id: number) {
    return this.Service.delete(id);
  }
}

