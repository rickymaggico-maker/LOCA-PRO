# LOCA PRO 0.0.1

Questa versione avvia la nuova numerazione di LOCA PRO e abilita il controllo
automatico degli aggiornamenti tramite GitHub Releases.

## Prima installazione della nuova numerazione

Il passaggio dalla vecchia versione `2.0.4` alla nuova `0.0.1` deve essere fatto
manualmente, perché `0.0.1` è numericamente inferiore a `2.0.4`.

1. Aprire PowerShell nella cartella del progetto.
2. Eseguire `npm.cmd install`.
3. Eseguire `npm.cmd run build`.
4. Installare il file `dist/LOCA-PRO-Setup-0.0.1.exe`.

I dati locali restano associati alla stessa applicazione e non vengono eliminati
dall'installazione.

## Pubblicazione della Release v0.0.1

Creare su GitHub una nuova Release con tag `v0.0.1` e allegare dalla cartella
`dist` tutti questi file:

- `LOCA-PRO-Setup-0.0.1.exe`
- `LOCA-PRO-Setup-0.0.1.exe.blockmap`
- `latest.yml`

La Release deve essere pubblicata, non lasciata come bozza.

## Aggiornamenti successivi

Per ogni nuova versione:

1. aumentare la versione in `package.json`, per esempio da `0.0.1` a `0.0.2`;
2. eseguire nuovamente `npm.cmd run build`;
3. creare e pubblicare la Release GitHub con lo stesso numero, per esempio
   `v0.0.2`;
4. allegare Setup, blockmap e `latest.yml`.

LOCA PRO controllerà automaticamente la disponibilità della nuova versione
all'avvio. Il controllo può essere avviato anche manualmente dal pulsante
Aggiornamenti.

## Requisito GitHub

Per consentire all'app installata di leggere le Release senza inserire token o
password nel programma, il repository usato per gli aggiornamenti deve essere
pubblico. Se il codice sorgente deve restare privato, è preferibile usare un
secondo repository pubblico contenente soltanto le Release.
