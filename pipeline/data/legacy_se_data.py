import pandas as pd
YRS=['2025-26','2026-27','2027-28','2028-29','2029-30','2030-31','2031-32','2032-33','2033-34','2034-35']
ES={ # v2: (enrollment basis, 0, enrollment basis, district capacity, util trajectory). Capacity: Meeting 3 pp54-56 published; Sunnyside/Green Springs/Countryside/Havencroft back-solved (lower bound); Madison Place/Indian Creek/Regency/Scarborough/Walnut Grove = KSDE total / published util. Closing basis = district 2025 enrollment (Scarborough: KSDE). Open basis = util25-26 x capacity.
'Tomahawk':(361,0,361,452,[77,80,78,75,74,74,73,72,71,72]),
'Black Bob':(413,0,413,479,[76,74,75,76,77,77,76,77,77,77]),
'Walnut Grove':(402,0,402,561,[71,70,67,65,64,63,62,62,60,60]),
'Indian Creek':(359,0,359,513,[70,70,72,72,66,63,62,62,59,60]),
'Regency Place':(437,0,437,643,[68,66,64,65,65,67,67,66,64,63]),
'Brougham':(307,0,307,472,[65,63,60,61,58,57,55,57,57,57]),
'Bentwood':(349,0,349,572,[61,62,63,65,65,67,68,67,64,63]),
'Heritage':(283,0,283,497,[61,60,62,63,62,63,62,62,61,61]),
'Madison Place':(385,0,385,664,[58,59,58,61,58,56,53,53,50,50]),
'Scarborough':(270,0,270,474,[57,54,52,52,50,48,48,47,45,44]),
'Briarwood':(295,0,295,547,[54,51,52,49,53,51,53,53,52,54]),
'Countryside':(316,0,316,585,[54,52,49,49,45,44,44,43,43,42]),
'Havencroft':(248,0,248,459,[54,54,53,52,53,54,55,55,55,56]),
'Arbor Creek':(321,0,321,617,[52,52,53,54,54,54,54,54,52,51]),
'Heatherstone':(323,0,323,673,[48,46,44,42,42,41,41,40,41,41]),
'Green Springs':(217,0,217,517,[42,42,40,39,39,38,39,39,38,39]),
'Sunnyside':(299,0,299,729,[41,43,42,40,40,38,39,38,37,38]),
}
MS={'Oregon Trail':(623,820,[76,76,78,77,77,74,76,78,79,79]),
'Pioneer Trail':(639,875,[73,77,78,79,80,76,75,67,62,57]),
'Santa Fe Trail':(631,864,[73,70,73,73,74,74,69,70,69,73]),
'Indian Trail':(577,836,[69,72,75,77,75,73,72,65,59,55]),
'Frontier Trail':(698,1026,[68,71,66,66,64,64,60,62,64,68]),
'California Trail':(593,956,[62,65,67,67,65,65,64,68,72,76]),
'Chisholm Trail':(580,951,[61,59,56,58,56,54,50,50,50,52])}
CLOSING_ES=['Tomahawk','Black Bob','Walnut Grove','Heritage','Scarborough']
DISTRICT_LIST={'Black Bob':['Brougham','Green Springs','Havencroft'],
'Heritage':['Brougham','Havencroft','Madison Place'],
'Scarborough':['Brougham','Sunnyside','Madison Place'],
'Tomahawk':['Briarwood','Havencroft','Indian Creek'],
'Walnut Grove':['Countryside','Heatherstone','Pleasant Ridge']}
MS_LIST=['Chisholm Trail','Frontier Trail','Santa Fe Trail','Pioneer Trail','Oregon Trail']
IMMERSION=130
def k5(s,yi):  # projected K-5 seats used
    t,p,k,fc,u=ES[s]; return u[yi]/100*fc

# NCES CCD 2024-25 Pre-K headcount per building: program-placed, not boundary-based. Fixed load at open schools; excluded from closing schools' boundary students.
PREK={'Tomahawk': 47, 'Black Bob': 18, 'Walnut Grove': 20, 'Indian Creek': 15, 'Regency Place': 7, 'Brougham': 17, 'Bentwood': 24, 'Heritage': 23, 'Madison Place': 22, 'Scarborough': 20, 'Briarwood': 23, 'Countryside': 9, 'Havencroft': 18, 'Arbor Creek': 38, 'Heatherstone': 43, 'Green Springs': 4, 'Sunnyside': 0}
def FIXED(s): return PREK.get(s,0)+(IMMERSION if s=='Arbor Creek' else 0)
