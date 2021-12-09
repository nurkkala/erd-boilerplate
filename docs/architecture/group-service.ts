import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Group,
  GroupCreateInput,
  GroupUpdateInput
} from "../models";
import { Repository } from "typeorm";
import { BaseService } from '@/shared/base.service';

@Injectable()
export class GroupService extends BaseService<Group> {
  constructor(
    @InjectRepository(Group)
    private readonly repo: Repository<Group>
  ) {
    super(repo);
  }

  // Create a new Group
  create(createInput: GroupCreateInput) {
    return this.repo.save(this.repo.create(createInput));
  }

  // Selectively include those relations that are always retrieved.
  private alwaysRelate = [
        // "survey",
        // "groupType",
  ];

  // Read a single Group
  readOne(id: number) {
    return this.repo.findOne(id, { relations: this.alwaysRelate });
  }

  // Read all Groups
  readAll() {
    return this.repo.find({ relations: this.alwaysRelate });
  }

  // Methods to retrieve related entities.

  retrieveRelatedSurvey(group: Group) {
    return this.retrieveOne(group, "survey");
  }

  retrieveRelatedGroupType(group: Group) {
    return this.retrieveOne(group, "groupType");
  }

  // Update a Group.
  update(updateInput: GroupUpdateInput) {
    return this.repo
    .preload(updateInput)
    .then(result => this.repo.save(result));
  }

  // Delete a Group.
  delete(id: number) {
    return this.repo.delete(id).then(result => result.affected);
  }
}

