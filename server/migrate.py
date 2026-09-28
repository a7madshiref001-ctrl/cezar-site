"""Create the current CEZAR schema. Safe to run repeatedly before deployment."""

from .db import Base, engine
from . import models  # noqa: F401


def main() -> None:
    Base.metadata.create_all(engine)


if __name__ == "__main__":
    main()
