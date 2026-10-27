// Captured `netstat` output (macOS 26) and typical Windows output, trimmed to the cases that matter.

const DARWIN_HEADER = `Active Internet connections (including servers)
Proto Recv-Q Send-Q  Local Address                                 Foreign Address                               (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options           gencnt    flags   flags1 usecnt rtncnt fltrs
`

export const DARWIN_TCP = `${DARWIN_HEADER}tcp4       0      0  10.111.100.161.60731   40.99.214.50.443       ESTABLISHED        21312         6396  131072  131768 Microsoft Outloo:676    00102 00020000 00000000000da15e 00180081 040c0900      2      0 000000
tcp46      0      0  *.64496                *.*                    LISTEN                 0            0  131072  131072         rapportd:653    00100 00000006 00000000000d9aae 00000000 00080800      1      0 000000
tcp6       0      0  ::1.5173               *.*                    LISTEN                 0            0  131072  131072             node:1686   00100 00000106 00000000000d39f3 00000001 00000800      1      0 000000
tcp4       0      0  127.0.0.1.59991        *.*                    LISTEN                 0            0  131072  131072 Code Helper (Plu:94757  00100 00000106 00000000000d0e34 00000001 00000800      1      0 000000
tcp4       0      0  *.22                   *.*                    LISTEN                 0            0  131072  131072          launchd:1      00180 00000006 0000000000001012 00000000 00000800      1      0 000000
tcp6       0      0  *.22                   *.*                    LISTEN                 0            0  131072  131072          launchd:1      00180 00000006 0000000000001011 00000000 00000800      1      0 000000
tcp4       0      0  10.111.100.161.8080    *.*                    LISTEN                 0            0  131072  131072  com.docker.backe:3047  00100 00000006 00000000000052bf 00000000 00000800      1      0 000000
tcp4       0      0  127.0.0.1.49428        127.0.0.1.8021         TIME_WAIT              0            0  131072  131072           Python:2419   00102 00000000 00000000000d0e35 00000000 00000800      0      0 000000
`

export const DARWIN_UDP = `${DARWIN_HEADER}udp4       0      0  10.111.100.161.63213   57.144.239.32.443                         10368         7662  786896    9216         WhatsApp:96291  00102 00020000 00000000000d9a7f 00100001 042c0900      1      0 000002
udp4       0      0  *.*                    *.*                                           0            0  786896    9216        identitys:662    00000 00000000 00000000000d9a10 00000000 00000800      1      0 000000
udp6       0      0  *.5353                 *.*                                           0          360  786896    9216          Spotify:1813   00100 00000200 00000000000d8032 20000001 00000800      2      0 000002
udp4       0      0  *.5353                 *.*                                           0          360  786896    9216          Spotify:1813   00100 00000200 00000000000d8030 20000001 04000800      2      0 000002
udp4       0      0  *.5353                 *.*                                           0          360  786896    9216          Spotify:1813   00100 00000200 00000000000d802f 20000001 04000800      2      0 000002
`

export const DARWIN_PS = `    1 root             /sbin/launchd
  653 pkuckelsberg     /usr/libexec/rapportd
 1686 pkuckelsberg     node
 3047 pkuckelsberg     /Applications/Docker.app/Contents/MacOS/com.docker.backend
94757 pkuckelsberg     /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)
`

export const WIN32_NETSTAT_EN = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1032
  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4
  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       8812
  TCP    192.168.1.5:49702      20.42.65.84:443        ESTABLISHED     5120
  TCP    [::]:135               [::]:0                 LISTENING       1032
  TCP    [::1]:5173             [::]:0                 LISTENING       8812
  UDP    0.0.0.0:5353           *:*                                    2340
  UDP    [fe80::1c2b:3d4e:5f60:7182%12]:1900  *:*                      4400
  UDP    192.168.1.5:55000      20.42.65.84:443                        5120
`.replace(/\n/g, '\r\n')

// A German Windows: other headers and `ABHÖREN`; the console codepage may garble the umlaut.
export const WIN32_NETSTAT_DE = `
Aktive Verbindungen

  Proto  Lokale Adresse         Remoteadresse          Status           PID
  TCP    0.0.0.0:135            0.0.0.0:0              ABH�REN         1032
  TCP    192.168.1.5:49702      20.42.65.84:443        HERGESTELLT     5120
  UDP    [::]:500               *:*                                    4840
`.replace(/\n/g, '\r\n')

export const WIN32_TASKLIST = `"System Idle Process","0","Services","0","8 K"
"System","4","Services","0","4.084 K"
"svchost.exe","1032","Services","0","12.344 K"
"node.exe","8812","Console","1","61.220 K"
"Spooler ""Print"".exe","2340","Services","0","9.000 K"
`.replace(/\n/g, '\r\n')

// `docker ps --format '{{.Names}}\t{{.Ports}}'`: IPv4 and IPv6 bindings, a range, UDP and an
// exposed but unpublished port.
export const DOCKER_PS = `web-1\t0.0.0.0:8080->80/tcp, [::]:8080->80/tcp
db-1\t3306/tcp
dns-1\t127.0.0.1:1053->53/udp
range-1\t0.0.0.0:7000-7001->9000-9001/tcp
idle-1\t
`
