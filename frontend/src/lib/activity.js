// "Who is doing what right now", built from other people's live messages.
// Shown in the top bar, e.g. "Sam is drawing" or "Sam and Priya are drawing".

// Someone counts as active until this long after their last movement.
export const ACTIVE_FOR_MS = 2000;

const VERBS = { pen: 'drawing', eraser: 'erasing', laser: 'pointing' };

// people: [{ name, tool }] in the order they became active.
export function describeActivity(people) {
  if (people.length === 0) return '';
  if (people.length === 1) {
    const [{ name, tool }] = people;
    return `${name} is ${VERBS[tool] ?? 'drawing'}`;
  }
  const verb = people.every((p) => p.tool === people[0].tool)
    ? VERBS[people[0].tool] ?? 'drawing'
    : 'active';
  if (people.length === 2) return `${people[0].name} and ${people[1].name} are ${verb}`;
  const others = people.length - 1;
  return `${people[0].name} and ${others} others are ${verb}`;
}

// Same people with the same tools, in the same order?
export function sameActivity(a, b) {
  return a.length === b.length && a.every((p, i) => p.name === b[i].name && p.tool === b[i].tool);
}
