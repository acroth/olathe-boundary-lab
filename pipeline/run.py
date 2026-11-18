"""Run the Olathe Boundary Lab data pipeline.

    python run.py                 run every step in order
    python run.py streets solve   run only the named steps (in the order given)
    python run.py --list          show the steps

Each step reads what earlier steps wrote to work/ and writes its own results; see each module's docstring for details.
"""
import sys
import time

from boundary_lab.settings import ensure_output_folders
from boundary_lab.steps import STEPS


def main(arguments: list[str]) -> None:
    if '--list' in arguments:
        for name, step in STEPS.items():
            print(f'{name:22} {step.__doc__.strip().splitlines()[0]}')
        return
    names = arguments or list(STEPS)
    unknown = [name for name in names if name not in STEPS]
    if unknown:
        sys.exit(f'Unknown step(s): {", ".join(unknown)}. Use --list to see the steps.')
    ensure_output_folders()
    for name in names:
        started = time.time()
        print(f'== {name}')
        STEPS[name].run()
        print(f'   done in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main(sys.argv[1:])
