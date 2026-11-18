"""District figures from the Nov 2026 boundary presentations (elementary deck + parent-meeting decks).
TABLE: five-year estimates 26-27..31-32, Early Childhood included at receiving schools (district's footnote).
PIECES: 2026-27 K-5 students moving from each closing school, by receiver (parent-meeting grade tables)."""
CAP = {'Bentwood': 572, 'Heatherstone': 673, 'Pleasant Ridge': 522, 'Regency Place': 642, 'Arbor Creek': 617, 'Briarwood': 547,
       'Brougham': 497, 'Green Springs': 494, 'Havencroft': 469, 'Madison Place': 645, 'Sunnyside': 715, 'Countryside': 617,
       'Indian Creek': 519, 'Black Bob': 457, 'Tomahawk': 452, 'Walnut Grove': 572, 'Scarborough': 472, 'Heritage': 522}
ENROLL_2026 = {'Bentwood': 356, 'Heatherstone': 315, 'Pleasant Ridge': 287, 'Regency Place': 408, 'Arbor Creek': 322, 'Briarwood': 300,
               'Brougham': 281, 'Green Springs': 223, 'Havencroft': 259, 'Madison Place': 374, 'Sunnyside': 312, 'Countryside': 303,
               'Indian Creek': 332, 'Black Bob': 392, 'Tomahawk': 361, 'Walnut Grove': 388, 'Scarborough': 252, 'Heritage': 251}
_AC1 = [322, 466, 472, 476, 479, 478]
_SS1 = [312, 552, 544, 534, 512, 519]; _SS2 = [312, 510, 505, 504, 485, 481]
_MD2 = [374, 499, 499, 489, 485, 482]; _PR2 = [287, 394, 381, 386, 387, 379]; _HN2 = [315, 565, 571, 575, 565, 562]
_BW2 = [300, 473, 464, 465, 459, 462]; _BE3 = [356, 470, 455, 460, 456, 468]; _GS3 = [223, 374, 362, 356, 350, 361]; _HC3 = [259, 402, 402, 388, 390, 385]
TABLE = {
 1: {'Bentwood': [356, 430, 439, 439, 445, 453], 'Heatherstone': [315, 461, 452, 452, 442, 439], 'Pleasant Ridge': [287, 434, 421, 426, 427, 419],
     'Regency Place': [408, 469, 476, 472, 475, 484], 'Arbor Creek': _AC1, 'Briarwood': [300, 430, 423, 425, 436, 443],
     'Brougham': [281, 412, 408, 414, 414, 409], 'Green Springs': [223, 400, 386, 375, 374, 384], 'Havencroft': [259, 377, 367, 364, 363, 371],
     'Madison Place': [374, 533, 532, 522, 523, 511], 'Sunnyside': _SS1},
 2: {'Bentwood': [356, 366, 375, 375, 381, 389], 'Heatherstone': _HN2, 'Pleasant Ridge': _PR2, 'Regency Place': [408, 469, 476, 472, 475, 484],
     'Arbor Creek': _AC1, 'Briarwood': _BW2, 'Brougham': [281, 398, 409, 388, 395, 398], 'Green Springs': [223, 420, 409, 407, 403, 409],
     'Havencroft': [259, 339, 335, 321, 321, 331], 'Madison Place': _MD2, 'Sunnyside': _SS2},
 3: {'Bentwood': _BE3, 'Countryside': [303, 341, 333, 313, 301, 310], 'Heatherstone': _HN2, 'Indian Creek': [332, 426, 428, 404, 390, 385],
     'Pleasant Ridge': _PR2, 'Regency Place': [408, 365, 372, 368, 371, 380], 'Arbor Creek': _AC1, 'Briarwood': [300, 368, 367, 371, 367, 361],
     'Brougham': [281, 358, 353, 348, 354, 356], 'Green Springs': _GS3, 'Havencroft': _HC3, 'Madison Place': _MD2, 'Sunnyside': _SS2},
 4: {'Bentwood': _BE3, 'Countryside': [303, 322, 314, 294, 282, 291], 'Heatherstone': [315, 530, 536, 540, 530, 527], 'Pleasant Ridge': _PR2,
     'Regency Place': [408, 451, 483, 474, 486, 491], 'Arbor Creek': [322, 539, 546, 544, 549, 550], 'Briarwood': _BW2,
     'Brougham': [281, 352, 347, 342, 348, 350], 'Green Springs': _GS3, 'Havencroft': _HC3, 'Madison Place': [374, 380, 379, 369, 370, 358], 'Sunnyside': _SS1},
}
PIECES = {
 1: [('Heritage', 'Brougham', 83), ('Heritage', 'Madison Place', 150), ('Scarborough', 'Sunnyside', 237), ('Black Bob', 'Brougham', 39),
     ('Black Bob', 'Green Springs', 176), ('Black Bob', 'Briarwood', 32), ('Tomahawk', 'Briarwood', 179), ('Tomahawk', 'Havencroft', 129),
     ('Walnut Grove', 'Heatherstone', 151), ('Walnut Grove', 'Pleasant Ridge', 216)],
 2: [('Heritage', 'Havencroft', 90), ('Heritage', 'Sunnyside', 83), ('Heritage', 'Madison Place', 60), ('Scarborough', 'Sunnyside', 132),
     ('Scarborough', 'Madison Place', 107), ('Black Bob', 'Brougham', 93), ('Black Bob', 'Green Springs', 132), ('Tomahawk', 'Briarwood', 322),
     ('Walnut Grove', 'Heatherstone', 260), ('Walnut Grove', 'Pleasant Ridge', 107)],
 3: [('Heritage', 'Havencroft', 150), ('Heritage', 'Sunnyside', 83), ('Scarborough', 'Sunnyside', 132), ('Scarborough', 'Madison Place', 107),
     ('Black Bob', 'Brougham', 78), ('Black Bob', 'Green Springs', 151), ('Tomahawk', 'Briarwood', 179), ('Tomahawk', 'Indian Creek', 129),
     ('Walnut Grove', 'Heatherstone', 260), ('Walnut Grove', 'Pleasant Ridge', 107)],
 4: [('Heritage', 'Havencroft', 150), ('Heritage', 'Brougham', 83), ('Scarborough', 'Sunnyside', 237), ('Black Bob', 'Brougham', 78),
     ('Black Bob', 'Green Springs', 151), ('Tomahawk', 'Briarwood', 322), ('Walnut Grove', 'Heatherstone', 227), ('Walnut Grove', 'Pleasant Ridge', 107),
     ('Walnut Grove', 'Countryside', 35)],
}

# Calibration targets: 2026-27 K-5 students (fall 2026 actual).
# Open schools: K-5 from the parent-meeting grade tables, else district 2026 enrollment less Pre-K (NCES).
#   Briarwood appears as 235 (Tomahawk deck) and 283 (Black Bob deck); 283 fits its 300 enrollment.
# Closing schools: the students the district places at receivers (residents; Tomahawk without its transfers in;
#   Black Bob = 137 general-education students + the ~66 in-area immersion students assumed to leave the program).
K5_2026 = {'Brougham': 263, 'Madison Place': 359, 'Havencroft': 257, 'Sunnyside': 309, 'Green Springs': 221, 'Briarwood': 283,
           'Heatherstone': 268, 'Pleasant Ridge': 267, 'Countryside': 300, 'Indian Creek': 281, 'Bentwood': 332, 'Regency Place': 401,
           'Arbor Creek': 284, 'Heritage': 233, 'Scarborough': 237, 'Tomahawk': 308, 'Walnut Grove': 367, 'Black Bob': 203}
# Early Childhood at the building, where the district's enrollment and K-5 counts give it (enrollment - K-5)
EC_2026 = {'Brougham': 18, 'Madison Place': 15, 'Havencroft': 2, 'Sunnyside': 3, 'Green Springs': 2, 'Briarwood': 17,
           'Heatherstone': 47, 'Pleasant Ridge': 20, 'Countryside': 3}
