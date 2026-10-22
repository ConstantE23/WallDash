import type { SignageState, SlideItem } from "../types/signage"

/**
 * Dynamic Signage Baseline
 * Static pre-defined mock datasets have been removed in favor of live database connections.
 * Labs are initialized with baseline room schemas ready for database population.
 */

export const INITIAL_SLIDES: SlideItem[] = []

/** Tutoring courses offered before an admin edits the list. */
export const DEFAULT_TUTOR_COURSES = ["151 & 152", "251"]

export function getTutorCourses(state: SignageState): string[] {
  return state.tutorCourses && state.tutorCourses.length > 0
    ? state.tutorCourses
    : DEFAULT_TUTOR_COURSES
}

export const INITIAL_STATE: SignageState = {
  version: 1,
  labs: {
    126: {
      id: 126,
      name: "Computer Lab 126",
      hours: {
        monThu: "8:00 AM – 10:00 PM",
        fri: "8:00 AM – 6:00 PM",
        weekend: "10:00 AM – 4:00 PM",
      },
      status: "Closed",
      currentOccupancy: 0,
      maxCapacity: 32,
      staffOnDuty: "",
      tutorSubject: "Systems Architecture & Linux",
      classes: [],
      lastUpdated: Date.now(),
      updatedBy: "Database Connection",
    },
    127: {
      id: 127,
      name: "Senior Design & Tutoring Lab 127",
      hours: {
        monThu: "9:00 AM – 9:00 PM",
        fri: "9:00 AM – 5:00 PM",
        weekend: "Closed",
      },
      status: "Closed",
      currentOccupancy: 0,
      maxCapacity: 24,
      staffOnDuty: "",
      tutorSubject: "Data Structures & Algorithms",
      classes: [],
      tutoringHours: {
        introToProgramming: "Mon & Wed · 2:00 PM – 5:00 PM",
        dataStructuresOne: "Tue & Thu · 3:00 PM – 6:00 PM",
      },
      tutorShifts: [],
      lastUpdated: Date.now(),
      updatedBy: "Database Connection",
    },
  },
  events: [],
  slides: [],
  activeSlideIndex: 0,
  isCarouselPaused: false,
  urgentAlert: null,
  lastAction: {
    type: "DATABASE_INITIALIZE",
    byClient: "System",
    clientRole: "Display Kiosk",
    timestamp: Date.now(),
    description: "System connected to dynamic database connection.",
  },
}
