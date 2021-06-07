import { Command } from "commander";

const program = new Command();

program.option("--fred", "fred").option("--zelda", "zelda");

program
  .command("alpha <flub>")
  .option("--foo", "foo")
  .action((flub: string, options: any, cmd: Command) => {
    console.log("FLUB", flub);
    console.log("OPTS", options);
    console.log("PROG", program.opts());
    console.log("CMD", cmd.opts());
  });

program.parse();
