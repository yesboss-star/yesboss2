$dir = "C:\VSLLP\krisha\2\yesboss2\backend"
Set-Location $dir
$log = "$dir\server_out.log"
$err = "$dir\server_err.log"
$p = Start-Process -NoNewWindow -FilePath "C:\Program Files\Python311\python.exe" -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" -WorkingDirectory $dir -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
$p.Id | Out-File "$dir\uvicorn.pid"
