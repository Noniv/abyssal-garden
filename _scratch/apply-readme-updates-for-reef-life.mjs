// One-off edit script: README updates for the reef life / bluer water work. The file size line is filled in from
// the built index.html, so run this after `npm run build`.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
const p = new URL('../README.md', import.meta.url); let s = readFileSync(p, 'utf8');
const ed = (a, b) => { if (s.split(a).length !== 2) throw new Error('no single match: ' + a.slice(0, 70)); s = s.replace(a, () => b); };
const kb = Math.round(statSync(new URL('../index.html', import.meta.url)).size / 1024);
ed(`Towering kelp forests, sunbeams pouring through a rippling surface, a sunken ship, manta rays gliding overhead.`,
  `Towering kelp forests, sunbeams pouring through a rippling surface, a sunken ship, manta rays gliding overhead, bait balls swirling as hunters cut through them, clownfish in their anemones.`);
s = s.replace(/The whole world fits in \*\*one \d+ KB HTML file\*\*\./, `The whole world fits in **one ${kb} KB HTML file**.`);
ed(`- **Manta rays**, schools of fish, rising bubbles and drifting particles`,
  `- **Manta rays**, rising bubbles and drifting particles
- **Reef fish** in glowing fantasy colours: clouds of anthias over the coral gardens, triggerfish, parrotfish, pairs of butterflyfish and idols, schools of fusiliers, chromis and blue tang
- **Bait balls**: thousands of silver fish swirling in open water, parting as larger hunters cut through them
- **Anemones** with clownfish among the tentacles, **soft corals** bending in the current, sea whips and carpets of pulsing polyps`);
ed(`| Jump to a viewpoint | \`1\` to \`6\` (the spots in the screenshots) |`, `| Jump to a viewpoint | \`1\` to \`6\` (\`3\` looks up at a bait ball; the others are the spots in the screenshots) |`);
ed(`| **High** | The full scene | Computers |`, `| **High** | The full scene, with the seabed four times finer near you | Computers |`);
ed(`decorated with about two million kelp leaves and plants, tens of thousands of rocks, and thousands of sponges, corals and fish.`,
  `decorated with about two million kelp leaves and plants, tens of thousands of rocks, thousands of sponges and corals, and about fourteen thousand fish.`);
ed(`- The ship, whale tail, mantas, fish and corals are built from simple mathematical shapes.`,
  `- The ship, whale tail, mantas, fish and corals are built from simple mathematical shapes.
- Nothing is simulated: every fish, tentacle and kelp blade works out where it is from the clock alone, on the graphics card. A bait fish gets out of a hunter's way by asking where that hunter is right now.
- Whatever you swim close to is lit by a soft diver's lamp, so nearby rock and coral show their true colours.`);
ed(`- It's built to run smoothly: about 180 fps at 2560×1440 on an RTX 5070 Ti.`, `- It's built to run smoothly: about 8 ms of graphics time per frame at 2560×1440 on an Apple M5 Max (about 110 fps on its 120 Hz display), and about 180 fps on an RTX 5070 Ti before the reef life was added.`);
ed(`- **Water color:** \`WCOL\` (blue-green water) and \`PCOL\` (purple grotto) near the top of the shared scene code in \`shaders.js\``,
  `- **Water color:** \`WCOL\` (the water's own blue) and \`PCOL\` (purple grotto) near the top of the shared scene code in \`shaders.js\`; \`KD\` and \`SIG\` next to them set how fast each color fades with depth and distance (raise the middle number for less green)
- **Fish:** the lists of schools, clouds, bait balls and loners are in the fish section of \`world.js\`; their colors and patterns are in \`fsFish\` in \`shaders.js\``);
ed(`\`F\` flies the camera along a one-minute path through the whole world, and \`B\` runs that flight as a benchmark and reports frame and GPU times.`,
  `\`F\` flies the camera along a one-minute path through the whole world, and \`B\` runs that flight as a benchmark and reports frame and GPU times. The same tools can be driven from the address bar (\`dev.html?pose=3&time=20\`, \`?fly=12.5\`, \`?bench=1\`) or from the console through \`window.dev\`.`);
writeFileSync(p, s); console.log('README updated, size line says', kb, 'KB');
