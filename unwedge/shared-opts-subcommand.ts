/*
 Run as follows:
   yarn ts-node unwedge/shared-opts-subcommand.ts --zelda sub alpha zipzip --fred --blub --foo
 yields:
   FLUB zipzip
   PROG { zelda: true, fred: true }
   SUBC { blub: true }
   OPTS { foo: true }
   ALL { zelda: true, fred: true, blub: true, foo: true }
 */
import { Command } from "commander";

const program = new Command()
  .option("--fred", "fred")
  .option("--zelda", "zelda");

const subCommand = program
  .command("sub")
  .description("a subcommand")
  .option("--blub", "fred")
  .option("--glub", "zelda");

subCommand
  .command("alpha <flub>")
  .option("--foo", "foo")
  .action((flub: string, options: any) => {
    console.log("FLUB", flub);
    console.log("PROG", program.opts()); // Options from top-level program.
    console.log("SUBC", subCommand.opts()); // Options from subcommand.
    console.log("OPTS", options); // Options from this command.

    // All together now.
    console.log("ALL", {
      ...program.opts(),
      ...subCommand.opts(),
      ...options,
    });
  });

program.parse();
