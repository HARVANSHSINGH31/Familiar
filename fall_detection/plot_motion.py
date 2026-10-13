import sys
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

G = 9.81  # 1 g in m/s²

df = pd.read_csv(sys.argv[1])
t = df.iloc[:, 0].to_numpy()                      # column 0 = time (s)
ax, ay, az = (df.iloc[:, i].to_numpy() for i in (1, 2, 3))
mag = np.sqrt(ax**2 + ay**2 + az**2) / G           # total acceleration in g

plt.plot(t, mag)
plt.axhline(1.0, linestyle="--", color="gray", label="1 g = still")
plt.xlabel("time (s)")
plt.ylabel("acceleration (g)")
plt.legend()
plt.show()
