"""Olathe USD 233's decisions and published figures, in one place.

Sources:
  * Facility alignment recommendation (Nov 2026 deck, p. 81): which schools close and when.
  * Nov 2026 boundary presentations: the elementary deck, the middle school deck, and the parent-meeting decks
    (functional capacity, fall 2026 enrollment, five-year estimates for each option, students moving by receiver).
Nothing here is modeled; everything is copied from the district's material so it can be checked line by line.
"""
from dataclasses import dataclass

DISTRICT_NUMBER = '233'


# ---------------------------------------------------------------------------------------------------------------------
# Closures and receivers
# ---------------------------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Closure:
    level: str              # 'es' or 'ms'
    school: str
    first_year_closed: int  # index into settings.SCHOOL_YEARS
    receivers: tuple[str, ...]  # open schools the district lists as taking its students


CLOSURES = [
    # Recommended closures at the end of 2026-27 (first year closed: 2027-28, index 2)
    Closure('es', 'Black Bob', 2, ('Brougham', 'Green Springs', 'Havencroft')),
    Closure('es', 'Heritage', 2, ('Brougham', 'Havencroft', 'Madison Place')),
    Closure('es', 'Scarborough', 2, ('Brougham', 'Sunnyside', 'Madison Place')),
    Closure('es', 'Tomahawk', 2, ('Briarwood', 'Havencroft', 'Indian Creek')),
    Closure('es', 'Walnut Grove', 2, ('Countryside', 'Heatherstone', 'Pleasant Ridge')),
    Closure('ms', 'Indian Trail', 2, ('Chisholm Trail', 'Frontier Trail', 'Santa Fe Trail', 'Pioneer Trail', 'Oregon Trail')),
    # Approved merges at the end of 2027-28 (first year closed: 2028-29, index 3): the whole area moves to one school
    Closure('es', 'Fairview', 3, ('Northview',)),
    Closure('es', 'Ridgeview', 3, ('Central',)),
]
MERGES = {'Fairview': 'Northview', 'Ridgeview': 'Central'}
CLOSING_ELEMENTARY = ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk', 'Walnut Grove']
SOUTHEAST_CLOSING = ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk']

# Open elementary schools around the closures (used when the solver may look past the district's receivers)
SOUTHEAST_OPEN_ELEMENTARY = ['Arbor Creek', 'Briarwood', 'Brougham', 'Green Springs', 'Havencroft', 'Indian Creek',
                             'Madison Place', 'Sunnyside', 'Regency Place', 'Bentwood']
NORTHEAST_OPEN_ELEMENTARY = ['Countryside', 'Heatherstone', 'Pleasant Ridge', 'Bentwood', 'Regency Place']

# Westview closed at the end of 2025-26; its area belongs to Rolling Ridge.
WESTVIEW_MERGED_INTO = 'Rolling Ridge'


# ---------------------------------------------------------------------------------------------------------------------
# Spanish immersion (Black Bob parent meeting, Nov 10 2026)
# ---------------------------------------------------------------------------------------------------------------------
# 236 immersion students at Black Bob in 2026-27: 132 live in Black Bob's area, 105 transfer in. The district expects about
# half to follow the program to Arbor Creek when Black Bob closes (118). Of the half that stays, the 66 living in Black Bob's
# area are counted with Black Bob's neighborhood students (they go to the receiving schools); the ~52 transfers return to
# schools outside this area and are not modeled. While Black Bob is open, the immersion counted in its building beyond those
# 66 is 236 - 66 = 170.
IMMERSION_STUDENTS = {'Arbor Creek': 118, 'Black Bob': 170}
IMMERSION_HOST = 'Arbor Creek'


# ---------------------------------------------------------------------------------------------------------------------
# Elementary figures (Nov 2026 boundary presentations)
# ---------------------------------------------------------------------------------------------------------------------
FUNCTIONAL_CAPACITY = {
    'Bentwood': 572, 'Heatherstone': 673, 'Pleasant Ridge': 522, 'Regency Place': 642, 'Arbor Creek': 617, 'Briarwood': 547,
    'Brougham': 497, 'Green Springs': 494, 'Havencroft': 469, 'Madison Place': 645, 'Sunnyside': 715, 'Countryside': 617,
    'Indian Creek': 519, 'Black Bob': 457, 'Tomahawk': 452, 'Walnut Grove': 572, 'Scarborough': 472, 'Heritage': 522,
}
ENROLLMENT_FALL_2026 = {
    'Bentwood': 356, 'Heatherstone': 315, 'Pleasant Ridge': 287, 'Regency Place': 408, 'Arbor Creek': 322, 'Briarwood': 300,
    'Brougham': 281, 'Green Springs': 223, 'Havencroft': 259, 'Madison Place': 374, 'Sunnyside': 312, 'Countryside': 303,
    'Indian Creek': 332, 'Black Bob': 392, 'Tomahawk': 361, 'Walnut Grove': 388, 'Scarborough': 252, 'Heritage': 251,
}
# Fall 2026 K-5 students: the model is calibrated to these.
#   Open schools: K-5 from the parent-meeting grade tables, else district 2026 enrollment less Pre-K (NCES).
#   Briarwood appears as 235 (Tomahawk deck) and 283 (Black Bob deck); 283 fits its 300 enrollment.
#   Closing schools: the students the district places at receivers (residents; Tomahawk without its transfers in;
#   Black Bob = 137 general-education students + the ~66 in-area immersion students assumed to leave the program).
K5_STUDENTS_FALL_2026 = {
    'Brougham': 263, 'Madison Place': 359, 'Havencroft': 257, 'Sunnyside': 309, 'Green Springs': 221, 'Briarwood': 283,
    'Heatherstone': 268, 'Pleasant Ridge': 267, 'Countryside': 300, 'Indian Creek': 281, 'Bentwood': 332, 'Regency Place': 401,
    'Arbor Creek': 284, 'Heritage': 233, 'Scarborough': 237, 'Tomahawk': 308, 'Walnut Grove': 367, 'Black Bob': 203,
}
# Early Childhood (Pre-K) in the building, where enrollment minus K-5 gives it
EARLY_CHILDHOOD_FALL_2026 = {
    'Brougham': 18, 'Madison Place': 15, 'Havencroft': 2, 'Sunnyside': 3, 'Green Springs': 2, 'Briarwood': 17,
    'Heatherstone': 47, 'Pleasant Ridge': 20, 'Countryside': 3,
}

# Five-year estimates for each district-wide option: students by school, 2026-27 through 2031-32,
# Early Childhood included at receiving schools (the district's footnote).
OPTION_FIVE_YEAR_ESTIMATES = {
    1: {'Bentwood': [356, 430, 439, 439, 445, 453], 'Heatherstone': [315, 461, 452, 452, 442, 439],
        'Pleasant Ridge': [287, 434, 421, 426, 427, 419], 'Regency Place': [408, 469, 476, 472, 475, 484],
        'Arbor Creek': [322, 466, 472, 476, 479, 478], 'Briarwood': [300, 430, 423, 425, 436, 443],
        'Brougham': [281, 412, 408, 414, 414, 409], 'Green Springs': [223, 400, 386, 375, 374, 384],
        'Havencroft': [259, 377, 367, 364, 363, 371], 'Madison Place': [374, 533, 532, 522, 523, 511],
        'Sunnyside': [312, 552, 544, 534, 512, 519]},
    2: {'Bentwood': [356, 366, 375, 375, 381, 389], 'Heatherstone': [315, 565, 571, 575, 565, 562],
        'Pleasant Ridge': [287, 394, 381, 386, 387, 379], 'Regency Place': [408, 469, 476, 472, 475, 484],
        'Arbor Creek': [322, 466, 472, 476, 479, 478], 'Briarwood': [300, 473, 464, 465, 459, 462],
        'Brougham': [281, 398, 409, 388, 395, 398], 'Green Springs': [223, 420, 409, 407, 403, 409],
        'Havencroft': [259, 339, 335, 321, 321, 331], 'Madison Place': [374, 499, 499, 489, 485, 482],
        'Sunnyside': [312, 510, 505, 504, 485, 481]},
    3: {'Bentwood': [356, 470, 455, 460, 456, 468], 'Countryside': [303, 341, 333, 313, 301, 310],
        'Heatherstone': [315, 565, 571, 575, 565, 562], 'Indian Creek': [332, 426, 428, 404, 390, 385],
        'Pleasant Ridge': [287, 394, 381, 386, 387, 379], 'Regency Place': [408, 365, 372, 368, 371, 380],
        'Arbor Creek': [322, 466, 472, 476, 479, 478], 'Briarwood': [300, 368, 367, 371, 367, 361],
        'Brougham': [281, 358, 353, 348, 354, 356], 'Green Springs': [223, 374, 362, 356, 350, 361],
        'Havencroft': [259, 402, 402, 388, 390, 385], 'Madison Place': [374, 499, 499, 489, 485, 482],
        'Sunnyside': [312, 510, 505, 504, 485, 481]},
    4: {'Bentwood': [356, 470, 455, 460, 456, 468], 'Countryside': [303, 322, 314, 294, 282, 291],
        'Heatherstone': [315, 530, 536, 540, 530, 527], 'Pleasant Ridge': [287, 394, 381, 386, 387, 379],
        'Regency Place': [408, 451, 483, 474, 486, 491], 'Arbor Creek': [322, 539, 546, 544, 549, 550],
        'Briarwood': [300, 473, 464, 465, 459, 462], 'Brougham': [281, 352, 347, 342, 348, 350],
        'Green Springs': [223, 374, 362, 356, 350, 361], 'Havencroft': [259, 402, 402, 388, 390, 385],
        'Madison Place': [374, 380, 379, 369, 370, 358], 'Sunnyside': [312, 552, 544, 534, 512, 519]},
}

# 2026-27 K-5 students moving from each closing school to each receiver, by option (parent-meeting grade tables):
# (closing school, receiving school, students)
OPTION_STUDENTS_MOVING = {
    1: [('Heritage', 'Brougham', 83), ('Heritage', 'Madison Place', 150), ('Scarborough', 'Sunnyside', 237),
        ('Black Bob', 'Brougham', 39), ('Black Bob', 'Green Springs', 176), ('Black Bob', 'Briarwood', 32),
        ('Tomahawk', 'Briarwood', 179), ('Tomahawk', 'Havencroft', 129),
        ('Walnut Grove', 'Heatherstone', 151), ('Walnut Grove', 'Pleasant Ridge', 216)],
    2: [('Heritage', 'Havencroft', 90), ('Heritage', 'Sunnyside', 83), ('Heritage', 'Madison Place', 60),
        ('Scarborough', 'Sunnyside', 132), ('Scarborough', 'Madison Place', 107),
        ('Black Bob', 'Brougham', 93), ('Black Bob', 'Green Springs', 132), ('Tomahawk', 'Briarwood', 322),
        ('Walnut Grove', 'Heatherstone', 260), ('Walnut Grove', 'Pleasant Ridge', 107)],
    3: [('Heritage', 'Havencroft', 150), ('Heritage', 'Sunnyside', 83),
        ('Scarborough', 'Sunnyside', 132), ('Scarborough', 'Madison Place', 107),
        ('Black Bob', 'Brougham', 78), ('Black Bob', 'Green Springs', 151),
        ('Tomahawk', 'Briarwood', 179), ('Tomahawk', 'Indian Creek', 129),
        ('Walnut Grove', 'Heatherstone', 260), ('Walnut Grove', 'Pleasant Ridge', 107)],
    4: [('Heritage', 'Havencroft', 150), ('Heritage', 'Brougham', 83), ('Scarborough', 'Sunnyside', 237),
        ('Black Bob', 'Brougham', 78), ('Black Bob', 'Green Springs', 151), ('Tomahawk', 'Briarwood', 322),
        ('Walnut Grove', 'Heatherstone', 227), ('Walnut Grove', 'Pleasant Ridge', 107), ('Walnut Grove', 'Countryside', 35)],
}
# Arbor Creek's 2027-28 enrollment in the district's tables, with half of immersion arriving (used as its starting point
# in the Option Builder's district-number check)
ARBOR_CREEK_WITH_IMMERSION_2027 = 466

# Capacities the district published earlier (Facility Alignment Meeting 3, pp. 54-56), used where the Nov 2026 figures don't
# cover a school. A few were back-solved from published utilization; see data/published_capacities.csv.
PLEASANT_RIDGE_PUBLISHED_CAPACITY = 522


# ---------------------------------------------------------------------------------------------------------------------
# Middle school figures (Nov 2026 middle school deck)
# ---------------------------------------------------------------------------------------------------------------------
MIDDLE_SCHOOL_CAPACITY = {'California Trail': 1007, 'Chisholm Trail': 999, 'Frontier Trail': 1071, 'Oregon Trail': 863,
                          'Pioneer Trail': 925, 'Santa Fe Trail': 907}
# Five-year estimates by concept, 2026-27 through 2031-32
MIDDLE_SCHOOL_CONCEPT_ESTIMATES = {
    1: {'California Trail': [617, 737, 703, 665, 621, 633], 'Chisholm Trail': [570, 760, 702, 686, 661, 659],
        'Frontier Trail': [721, 813, 818, 805, 783, 756], 'Oregon Trail': [621, 593, 582, 574, 579, 556],
        'Pioneer Trail': [646, 673, 714, 748, 776, 743], 'Santa Fe Trail': [605, 720, 714, 713, 672, 654]},
    2: {'California Trail': [617, 809, 775, 737, 693, 705], 'Chisholm Trail': [570, 793, 724, 711, 691, 691],
        'Frontier Trail': [721, 780, 796, 780, 753, 724], 'Oregon Trail': [621, 700, 687, 677, 674, 648],
        'Pioneer Trail': [646, 663, 738, 772, 800, 767], 'Santa Fe Trail': [605, 613, 609, 610, 577, 562]},
    3: {'California Trail': [617, 754, 732, 701, 665, 676], 'Chisholm Trail': [570, 787, 764, 751, 728, 723],
        'Frontier Trail': [721, 759, 764, 751, 729, 702], 'Oregon Trail': [621, 700, 687, 677, 674, 648],
        'Pioneer Trail': [646, 675, 716, 733, 756, 746], 'Santa Fe Trail': [605, 613, 609, 610, 577, 562]},
    4: {'California Trail': [617, 885, 851, 813, 769, 781], 'Chisholm Trail': [570, 697, 674, 661, 638, 633],
        'Frontier Trail': [721, 933, 938, 925, 903, 876], 'Oregon Trail': [621, 593, 582, 574, 579, 556],
        'Pioneer Trail': [646, 626, 701, 735, 763, 730], 'Santa Fe Trail': [605, 720, 714, 713, 672, 654]},
    5: {'California Trail': [617, 628, 606, 575, 539, 550], 'Chisholm Trail': [570, 841, 818, 805, 782, 777],
        'Frontier Trail': [721, 885, 890, 877, 855, 828], 'Oregon Trail': [621, 593, 582, 574, 579, 556],
        'Pioneer Trail': [646, 621, 662, 679, 702, 692], 'Santa Fe Trail': [605, 720, 714, 713, 672, 654]},
}
# The deck's "Summary of Changes" slides, condensed
MIDDLE_SCHOOL_CONCEPT_SUMMARIES = {
    1: 'Havencroft and Heritage to Frontier Trail; Scarborough and south Brougham to Chisholm Trail; Ridgeview to Santa Fe Trail; '
       'west Heatherstone to California Trail; east Tomahawk to Pioneer Trail.',
    2: 'Indian Creek, Tomahawk and east Briarwood to California Trail; Pleasant Ridge and east Heatherstone to Pioneer Trail; '
       'Havencroft and Heritage to Frontier Trail; Scarborough and south/west Brougham to Chisholm Trail; Ridgeview to Oregon Trail.',
    3: 'East Tomahawk and east Briarwood to California Trail; Scarborough and east/west Heritage to Chisholm Trail; '
       'Havencroft and central Heritage to Frontier Trail; west Tomahawk to Pioneer Trail; Ridgeview to Oregon Trail.',
    4: 'Indian Creek, Tomahawk, east Briarwood and north Green Springs to California Trail; north Pleasant Ridge and east '
       'Heatherstone to Pioneer Trail; Havencroft and Heritage to Frontier Trail; Scarborough to Chisholm Trail; Ridgeview to Santa Fe Trail.',
    5: 'Only three schools change: Scarborough and Brougham to Chisholm Trail; Havencroft, Heritage and west Tomahawk to '
       'Frontier Trail; Ridgeview to Santa Fe Trail (the map shows Santa Fe Trail; the summary slide says Oregon Trail).',
}
