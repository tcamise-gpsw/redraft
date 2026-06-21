import { Command } from 'commander';

function handleServe(directory = './proposals') {
  console.log(`Draftspace local server scaffolding ready for ${directory}.`);
}

const program = new Command()
  .name('draftspace')
  .description('Draftspace local tooling')
  .argument('[directory]', 'proposal directory for the default serve command')
  .action((directory) => {
    if (directory) {
      handleServe(directory);
      return;
    }

    program.help();
  });

program
  .command('serve')
  .argument('[directory]', 'proposal directory')
  .action((directory) => {
    handleServe(directory);
  });

program.parse(process.argv);
