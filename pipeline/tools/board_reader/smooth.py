import numpy as np, geopandas as gpd
def adjacency(U):
    sidx=U.sindex; nb={i:{} for i in range(len(U))}; B=U.geometry.buffer(6)
    for i,g in enumerate(B):
        for j in sidx.query(g):
            if j<=i: continue
            L=g.intersection(B.iloc[j]).area/12
            if L>25: nb[i][j]=L; nb[j][i]=L
    return nb
def smooth(U,col,qcol,nb,rounds=4):
    cls=list(U[col]); q=list(U[qcol]); area=U.area.values/43560
    for _ in range(rounds):
        new=cls[:]
        for i in range(len(U)):
            w={}
            for j,L in nb[i].items():
                if cls[j] is not None: w[cls[j]]=w.get(cls[j],0)+L
            if not w: continue
            top=max(w,key=w.get); share=w[top]/sum(w.values())
            weak = cls[i] is None or q[i]<0.55
            island = cls[i] not in w and share>=0.75 and area[i]<25
            if (weak and share>=0.6) or island: new[i]=top
        cls=new
    return cls
